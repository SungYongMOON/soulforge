import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,mkdirSync,mkdtempSync,readFileSync,readdirSync,realpathSync,rmSync,writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildHwpxSkillCandidate,HWPX_SKILL_AUTHOR_SOURCE_REFS} from '../src/hwpx_skill_author.mjs';
import {pinHwpxReferenceBinding} from '../src/hwpx_reference_runner.mjs';
import {createDurableToolWorkshop} from '../src/tool_workshop_durable.mjs';
import {sha256} from '../src/workshop_files.mjs';

const ROOT=fileURLToPath(new URL('../../../',import.meta.url));
const python=process.env.SOULFORGE_HWPX_TEST_PYTHON;
const available=Boolean(python)&&existsSync(python);
const options={skip:available?false:'SOULFORGE_HWPX_TEST_PYTHON is not configured or does not exist',timeout:90000};
const fixtureCode=readFileSync(new URL('./hwpx_reference_child.test.mjs',import.meta.url),'utf8').match(/const fixtureCode=String\.raw`([\s\S]*?)`;/)?.[1];
function setup(t,scenario='pass') {
  const root=mkdtempSync(path.join(tmpdir(),'hwpx-author-'));
  t.after(()=>{assert.equal(path.dirname(realpathSync(root)),realpathSync(tmpdir()));assert.ok(path.basename(root).startsWith('hwpx-author-'));rmSync(root,{recursive:true,force:true});});
  const dirs=Object.fromEntries(['input','work','output','queue','authority','fixture'].map(name=>{const dir=path.join(root,name);mkdirSync(dir);return [name,dir];}));
  assert.ok(fixtureCode);
  const compactReport=scenario==='report_text_edits';
  if(compactReport){
    const built=spawnSync(python,['-I','-B',path.join(ROOT,'.registry/skills/hwpx_document/codex/scripts/build_hwpx.py'),'--template','report','--output',path.join(dirs.fixture,'reference.hwpx')],{encoding:'utf8',windowsHide:true,timeout:10000});
    assert.equal(built.status,0,built.stderr);
  }
  const code=compactReport?String.raw`
import json,pathlib,sys,zipfile
from lxml import etree
root=pathlib.Path(sys.argv[1])
with zipfile.ZipFile(root/'reference.hwpx') as z: xml=z.read('Contents/section0.xml')
nodes=list(etree.fromstring(xml).iter('{http://www.hancom.co.kr/hwpml/2011/paragraph}t'))
edits=[{'part':'Contents/section0.xml','text_index':i,'before':nodes[i].text,'after':after} for i,after in [(9,'시험을 준비했다'),(12,'결과를 검토했다'),(14,'A&B <C> 검토'),(17,'근거를 보완했다')]]
(root/'draft.json').write_text(json.dumps({'text_edits':edits},ensure_ascii=False),encoding='utf-8')
` : fixtureCode+String.raw`
with zipfile.ZipFile(root/'candidate.hwpx') as z:
    draft={'sections':[{'part':name,'xml':z.read(name).decode('utf-8')} for name in request['allowed_parts']], 'expected_text':request['expected_text']}
(root/'draft.json').write_text(json.dumps(draft,ensure_ascii=False),encoding='utf-8')
`;
  const made=spawnSync(python,['-I','-B','-c',code,dirs.fixture,path.join(ROOT,'.registry/skills/hwpx_document/codex/templates/base'),scenario],{encoding:'utf8',windowsHide:true,timeout:10000});
  assert.equal(made.status,0,made.stderr);
  const reference=path.join(dirs.authority,'reference.hwpx');writeFileSync(reference,readFileSync(path.join(dirs.fixture,'reference.hwpx')),{flag:'wx'});
  const binding=pinHwpxReferenceBinding({pythonExecutable:python,templatePath:reference,templateApprovalRef:'approval.template',templateProvenance:'synthetic_fixture',allowedParts:compactReport?['Contents/section0.xml']:['Contents/section0.xml','Contents/section1.xml']});
  const save=(file,value)=>{const bytes=Buffer.from(JSON.stringify(value));writeFileSync(file,bytes);return sha256(bytes);};
  const bindingPath=path.join(dirs.authority,'reference-binding.json');
  const config={version:1,project_ref:'project.synthetic',job_ref:'job.hwpx.author',source_ref:'source.synthetic',revision:'revision.one',approval_ref:'approval.standing',provenance:'synthetic_fixture',
    input_root:dirs.input,work_root:dirs.work,output_root:dirs.output,queue_root:dirs.queue,reference_binding:{path:bindingPath,sha256:save(bindingPath,binding)},
    pack_sha256:sha256(readFileSync(path.join(ROOT,'.registry/skills/hwpx_document/codex/scripts/office/pack.py')))};
  const configPath=path.join(dirs.authority,'author.json'),draftPath=path.join(dirs.fixture,'draft.json');
  const call={configPath,configSha256:save(configPath,config),draftPath,draftSha256:sha256(readFileSync(draftPath)),jobRef:config.job_ref,assertCurrent:()=>undefined};
  return {root,dirs,config,binding,bindingPath,reference,call,save,rebind(){config.reference_binding.sha256=save(bindingPath,binding);call.configSha256=save(configPath,config);},
    draft(value){call.draftSha256=save(draftPath,value);},queue(){return createDurableToolWorkshop({stateRoot:dirs.queue});}};
}
function noCustody(f){assert.equal(f.queue().getCustodyReceipt(f.call.jobRef),null);assert.deepEqual(readdirSync(f.dirs.output),[]);}

test('four report body text edits preserve all other XML bytes, generate expected text and replay unchanged',options,async t=>{
  const f=setup(t,'report_text_edits'),original=readFileSync(f.reference),draft=JSON.parse(readFileSync(f.call.draftPath));
  assert.deepEqual(draft.text_edits.map(edit=>edit.text_index),[9,12,14,17]);
  assert.ok(readFileSync(f.call.draftPath).length<1024);
  const result=await buildHwpxSkillCandidate(f.call);
  assert.equal(result.receipt.artifact.validator_ref,'validator.hwpx_reference_readback:v1');
  assert.equal(result.receipt.artifact.section_count,1);assert.equal(result.receipt.artifact.page_count_verified,false);
  assert.deepEqual(readFileSync(f.reference),original);
  const verify=String.raw`
import json,sys,zipfile
from lxml import etree
with zipfile.ZipFile(sys.argv[1]) as z: before={n:z.read(n) for n in z.namelist()}
with zipfile.ZipFile(sys.argv[2]) as z: after={n:z.read(n) for n in z.namelist()}
draft=json.load(open(sys.argv[3],encoding='utf-8'));part='Contents/section0.xml'
assert set(before)==set(after)
assert all(before[n]==after[n] for n in before if n!=part)
expected=before[part].decode('utf-8')
for edit in draft['text_edits']:
    escaped=edit['after'].replace('&','&amp;').replace('<','&lt;').replace('>','&gt;')
    expected=expected.replace('<hp:t>'+edit['before']+'</hp:t>','<hp:t>'+escaped+'</hp:t>',1)
assert after[part]==expected.encode('utf-8')
nodes=list(etree.fromstring(after[part]).iter('{http://www.hancom.co.kr/hwpml/2011/paragraph}t'))
for edit in draft['text_edits']: assert nodes[edit['text_index']].text==edit['after']
print(json.dumps([''.join(n.itertext()) for n in nodes],ensure_ascii=True))`;
  const checked=spawnSync(python,['-I','-B','-c',verify,f.reference,result.candidate_path,f.call.draftPath],{encoding:'utf8',windowsHide:true,timeout:10000});
  assert.equal(checked.status,0,checked.stderr);assert.deepEqual(result.expected_text,JSON.parse(checked.stdout));
  const events=f.queue().eventLog();assert.deepEqual(await buildHwpxSkillCandidate(f.call),result);assert.deepEqual(f.queue().eventLog(),events);
});

test('compact edit admission rejects duplicate, disallowed part, invalid index type and mixed draft forms before work',options,async t=>{
  const f=setup(t,'report_text_edits'),draft=JSON.parse(readFileSync(f.call.draftPath)),edit=draft.text_edits[0];
  for(const value of [{text_edits:[edit,edit]},{text_edits:[{...edit,part:'Contents/section1.xml'}]},
    {text_edits:[{...edit,text_index:-1}]},{text_edits:[{...edit,text_index:true}]},{text_edits:[]},
    {...draft,expected_text:[]},{...draft,sections:[]},{text_edits:[{...edit,approval_ref:'approval.model'}]}]){
    f.draft(value);await assert.rejects(buildHwpxSkillCandidate(f.call));
  }
  assert.deepEqual(readdirSync(f.dirs.work),[]);noCustody(f);
});

for(const invalid of ['before','missing-index'])test(`compact ${invalid} refusal has no published input or custody`,options,async t=>{
  const f=setup(t,'report_text_edits'),draft=JSON.parse(readFileSync(f.call.draftPath));
  if(invalid==='before')draft.text_edits[0].before='not the approved text';else draft.text_edits[0].text_index=9999;
  f.draft(draft);await assert.rejects(buildHwpxSkillCandidate(f.call),{code:'author_child_failed'});
  noCustody(f);assert.deepEqual(readdirSync(f.dirs.input),[]);
  assert.equal(sha256(readFileSync(f.reference)),f.binding.template_sha256);
  await assert.rejects(buildHwpxSkillCandidate(f.call),{code:'author_recovery_required'});
});

test('parser identity maps comments, CDATA, alternate namespaces and empty text; nested text edits are refused',options,()=>{
  const program=String.raw`
import importlib.util,pathlib,sys
from lxml import etree
def load(name,file):
    spec=importlib.util.spec_from_file_location(name,file);module=importlib.util.module_from_spec(spec);sys.modules[name]=module;spec.loader.exec_module(module);return module
author=load('author',sys.argv[1]);ref=load('reference',sys.argv[2]);part='Contents/section0.xml';hp=ref.HP
def run(body,edits):
    xml=('<hs:sec xmlns:hs="'+ref.HS+'" xmlns:hp="'+hp+'" xmlns:x="urn:other">'+body+'</hs:sec>').encode()
    roots={part:etree.fromstring(xml)}
    return xml,author.text_edit_replacements({part:xml},roots,[part],[part],edits,ref,etree)
def edit(index,before,after):return {'part':part,'text_index':index,'before':before,'after':after}
body='<!-- <hp:t>fake</hp:t> --><x:t>other</x:t><hp:t><![CDATA[<hp:t>cdata</hp:t>]]></hp:t><hp:t/><p:t xmlns:p="'+hp+'">last</p:t>'
original,(replaced,texts)=run(body,[edit(0,'<hp:t>cdata</hp:t>','A&B <C>'),edit(1,'','empty'),edit(2,'last','tail')])
expected=original.replace(b'<![CDATA[<hp:t>cdata</hp:t>]]>',b'A&amp;B &lt;C&gt;').replace(b'<hp:t/>',b'<hp:t>empty</hp:t>').replace(b'>last</p:t>',b'>tail</p:t>')
assert replaced[part]==expected and texts==['A&B <C>','empty','tail']
for nested,change in [('<hp:t>outer<hp:t>inner</hp:t></hp:t>',edit(0,'outer','x')),('<hp:t>outer<hp:t>inner</hp:t></hp:t>',edit(1,'inner','x')),('<hp:t>text<!--comment--></hp:t>',edit(0,'text','x')),('<hp:t>text<hp:tab/></hp:t>',edit(0,'text','x'))]:
    try:run(nested,[change])
    except ref.Blocked as error:assert str(error)=='text_edit_complex'
    else:raise AssertionError('complex text accepted')
print('parser-identity-and-complex-refusals-passed')`;
  const result=spawnSync(python,['-I','-B','-c',program,path.join(ROOT,'guild_hall/tool_workshop/src/hwpx_skill_author.py'),path.join(ROOT,'guild_hall/tool_workshop/src/hwpx_reference_child.py')],{encoding:'utf8',windowsHide:true,timeout:10000});
  assert.equal(result.status,0,result.stderr);assert.equal(result.stdout.trim(),'parser-identity-and-complex-refusals-passed');
});

test('real canonical pack plus reference queue returns exact candidate; process reopen replays without repacking',options,async t=>{
  const f=setup(t),before=readFileSync(f.reference),result=await buildHwpxSkillCandidate(f.call);
  assert.equal(result.render_required,true);assert.equal(result.receipt.artifact.validator_ref,'validator.hwpx_reference_readback:v1');
  assert.equal(result.receipt.artifact.section_count,2);assert.equal(result.receipt.artifact.page_count_verified,false);
  assert.equal(sha256(readFileSync(result.candidate_path)),result.sha256);assert.equal(readFileSync(result.candidate_path).length,result.size_bytes);
  assert.deepEqual(readFileSync(f.reference),before);assert.deepEqual(f.queue().getCustodyReceipt(f.call.jobRef),result.receipt);
  const job=f.queue().getJob(f.call.jobRef),packet=JSON.parse(readFileSync(path.join(f.dirs.input,`${job.input_bundle_manifest_digest}.json`)));
  assert.equal(Object.keys(packet).length,10);assert.equal(packet.project_ref,f.config.project_ref);assert.equal(job.approval_ref,f.config.approval_ref);
  assert.deepEqual(packet.allowed_parts,f.binding.allowed_parts);assert.deepEqual(packet.expected_text,JSON.parse(readFileSync(f.call.draftPath)).expected_text);
  const events=f.queue().eventLog(),runs=readdirSync(f.dirs.work);
  const reopened=await buildHwpxSkillCandidate(f.call);assert.deepEqual(reopened,result);
  // Simulate loss of the final response-metadata write after committed custody.
  // The new process must recover the receipt without rerunning author/validator.
  const completed=path.join(f.dirs.work,runs.find(name=>name.startsWith('author-')),'completed.json');
  rmSync(completed);
  const source=new URL('../src/hwpx_skill_author.mjs',import.meta.url).href;
  const processCode=`import {buildHwpxSkillCandidate} from ${JSON.stringify(source)};const [configPath,configSha256,draftPath,draftSha256,jobRef]=process.argv.slice(1);console.log(JSON.stringify(await buildHwpxSkillCandidate({configPath,configSha256,draftPath,draftSha256,jobRef,assertCurrent:()=>undefined})));`;
  const replay=spawnSync(process.execPath,['--input-type=module','-e',processCode,...['configPath','configSha256','draftPath','draftSha256','jobRef'].map(key=>f.call[key])],{encoding:'utf8',windowsHide:true,timeout:20000,env:{SystemRoot:process.env.SystemRoot??'',TEMP:f.dirs.fixture,TMP:f.dirs.fixture}});
  assert.equal(replay.status,0,replay.stderr);assert.deepEqual(JSON.parse(replay.stdout),result);
  assert.deepEqual(f.queue().eventLog(),events);assert.deepEqual(readdirSync(f.dirs.work),runs);
  const changed=JSON.parse(readFileSync(f.call.draftPath));changed.sections[0].xml+='\n';f.draft(changed);
  await assert.rejects(buildHwpxSkillCandidate(f.call),{code:'author_job_reuse_changed'});
  assert.deepEqual(f.queue().eventLog(),events);
  assert.ok(HWPX_SKILL_AUTHOR_SOURCE_REFS.includes('guild_hall/tool_workshop/src/hwpx_skill_author.py'));
});

test('config/job/draft pins and standing authority are fixed before any author attempt',options,async t=>{
  const f=setup(t);
  for(const delta of [{jobRef:'job.foreign'},{configSha256:'0'.repeat(64)},{draftSha256:'0'.repeat(64)},{assertCurrent:()=>false},{assertCurrent:()=>Promise.resolve(true)}])
    await assert.rejects(buildHwpxSkillCandidate({...f.call,...delta}));
  assert.deepEqual(readdirSync(f.dirs.work),[]);noCustody(f);
});

test('template, pack and reference-source hash drift cannot repin or execute',options,async t=>{
  const f=setup(t),original=structuredClone(f.binding);
  for(const mutate of [()=>f.binding.template_sha256='0'.repeat(64),()=>f.binding.sources[0].sha256='0'.repeat(64),()=>f.binding.python_sha256='0'.repeat(64)]){
    mutate();f.rebind();await assert.rejects(buildHwpxSkillCandidate(f.call));Object.assign(f.binding,structuredClone(original));
  }
  f.config.pack_sha256='0'.repeat(64);f.rebind();await assert.rejects(buildHwpxSkillCandidate(f.call),{code:'author_pack_binding_changed'});
  assert.deepEqual(readdirSync(f.dirs.work),[]);noCustody(f);
});

test('model draft cannot add authority, commands or expand the section allowlist',options,async t=>{
  const f=setup(t),original=JSON.parse(readFileSync(f.call.draftPath));
  for(const changed of [{...original,approval_ref:'approval.model'},{...original,command:'arbitrary'},
    {...original,sections:[...original.sections,{part:'Contents/header.xml',xml:'<x/>'}]},
    {...original,sections:[{part:'Contents/section9.xml',xml:original.sections[0].xml},original.sections[1]]}]){
    f.draft(changed);await assert.rejects(buildHwpxSkillCandidate(f.call));
  }
  writeFileSync(f.call.draftPath,' '.repeat(65537));f.call.draftSha256=sha256(readFileSync(f.call.draftPath));
  await assert.rejects(buildHwpxSkillCandidate(f.call),{code:'file_size_invalid'});
  assert.deepEqual(readdirSync(f.dirs.work),[]);noCustody(f);
});

test('unsafe XML and second-section drift fail real reference checks before input publication or custody',options,async t=>{
  for(const scenario of ['external','second_section_drift']){
    const f=setup(t,scenario),before=readFileSync(f.reference);
    await assert.rejects(buildHwpxSkillCandidate(f.call),{code:'author_child_failed'});
    noCustody(f);assert.deepEqual(readdirSync(f.dirs.input),[]);assert.deepEqual(readFileSync(f.reference),before);
    assert.ok(readdirSync(f.dirs.work).some(name=>name.startsWith('author-')));
    await assert.rejects(buildHwpxSkillCandidate(f.call),{code:'author_recovery_required'});
  }
});

test('pre-cancelled author never publishes; cancellation after snapshot preserves source and has no custody',options,async t=>{
  const f=setup(t),controller=new AbortController();controller.abort();
  await assert.rejects(buildHwpxSkillCandidate({...f.call,signal:controller.signal}),{code:'author_cancelled'});
  assert.deepEqual(readdirSync(f.dirs.work),[]);
  const during=new AbortController();
  await assert.rejects(buildHwpxSkillCandidate({...f.call,signal:during.signal,assertCurrent:()=>{
    if(readdirSync(f.dirs.work).some(name=>existsSync(path.join(f.dirs.work,name,'author-request.json'))))during.abort();
  }}),{code:'author_cancelled'});
  noCustody(f);assert.deepEqual(readdirSync(f.dirs.input),[]);assert.equal(sha256(readFileSync(f.reference)),f.binding.template_sha256);
});

test('binding revocation after actual pack cannot publish input or obtain custody',options,async t=>{
  const f=setup(t);let observedPacked=false;
  await assert.rejects(buildHwpxSkillCandidate({...f.call,assertCurrent:()=>{
    if(readdirSync(f.dirs.work).some(name=>existsSync(path.join(f.dirs.work,name,'candidate.hwpx')))){
      observedPacked=true;throw Object.assign(new Error('synthetic_revoked'),{code:'synthetic_revoked'});
    }
  }}));
  assert.equal(observedPacked,true);noCustody(f);assert.deepEqual(readdirSync(f.dirs.input),[]);
});

test('microtask revocation cannot enter between synchronous current guard and queue or claim creation',options,async t=>{
  const f=setup(t);let checks=0,revoked=false,atRevocation;
  const claimPath=path.join(f.dirs.work,`author-${sha256(f.call.jobRef).slice(0,32)}`,'claim.json');
  const queueFiles=()=>readdirSync(f.dirs.queue).sort().map(name=>({name,sha256:sha256(readFileSync(path.join(f.dirs.queue,name)))}));
  await assert.rejects(buildHwpxSkillCandidate({...f.call,assertCurrent:()=>{
    if(++checks===1)queueMicrotask(()=>{
      // These synchronous setup effects must either precede revocation under
      // valid authority or not happen. Previously await current() yielded here,
      // then created both DB and claim after this callback had revoked access.
      atRevocation={queue:queueFiles(),claim:existsSync(claimPath)?sha256(readFileSync(claimPath)):null};
      revoked=true;
    });
    if(revoked)throw Object.assign(new Error('synthetic_revoked'),{code:'synthetic_revoked'});
  }}));
  assert.equal(revoked,true);assert.ok(atRevocation.queue.some(file=>file.name==='workshop.sqlite'));
  assert.ok(atRevocation.claim,'claim creation must not move after the queued revocation');
  assert.deepEqual(queueFiles(),atRevocation.queue);assert.equal(sha256(readFileSync(claimPath)),atRevocation.claim);
  noCustody(f);assert.deepEqual(readdirSync(f.dirs.input),[]);
});

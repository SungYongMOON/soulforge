import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createForgeWorldHttpController } from '../src/forge_world_http.mjs';
import { createWorldCoverageReader } from '../../team-ops-board/src/server/forge-world-coverage-adapter.mjs';
import { worldCoverageDigest } from '../../../../guild_hall/requirement_trace/forge_world_coverage.mjs';

const origin = 'http://127.0.0.1:54321';
function invoke(controller, pathname = '/api/forge-world/coverage', edits = {}) {
  const req = {method:'GET',headers:{host:'127.0.0.1:54321'},socket:{remoteAddress:'127.0.0.1'},...edits};
  const headers = {}, res = {setHeader(key,value){headers[key]=value;},end(body){this.body=body;}};
  return controller(req,res,new URL(pathname,origin)).then(handled => ({handled,status:res.statusCode,headers,body:res.body}));
}
function controller(options={}) {
  return createForgeWorldHttpController({allowedOrigin:origin,stateRoot:tmpdir(),currentAccount:()=>({id:'account.a'}),
    sessionKey:()=> 'session.a',canAccessProject:()=>false,...options});
}
function coverage(code) {
  const at = new Date().toISOString(), body = {schema_version:'soulforge.forge_world.coverage.v1',project_code:code,source_kind:'sample',
    observed_at:at,valid_at:at,input_revision:`sha256:${'a'.repeat(64)}`,
    unbound_counts:{needs_undeclared:0,policy_slot_unmapped:0,unexpected_observed:0},slots:[]};
  return {...body,generation:worldCoverageDigest(body)};
}

test('same-origin world HTML and its exact shared assets link to the actual workbench',async()=>{
  const handle=controller();
  const page=await invoke(handle,'/forge-world.html');
  assert.equal(page.status,200);assert.match(page.body,/data-world-host="world-tree"/);
  assert.match(page.body,/href="\/workbench.html"/);assert.match(page.body,/자료·검토/);
  for(const route of ['/forge-world/assets/page.mjs','/forge-world/assets/style.css']) {
    const asset=await invoke(handle,route);assert.equal(asset.status,200);assert.ok(asset.body.length>100);
    assert.equal(asset.headers['X-Content-Type-Options'],'nosniff');
  }
  assert.equal((await invoke(handle,'/forge-world/assets/constructor')).handled,false);
});

test('origin, method, query and login failures occur before any metadata read',async()=>{
  let reads=0;const handle=controller({readerFactory:()=>{reads++;throw new Error('must_not_read');}});
  for(const [path,edits,status] of [
    ['/api/forge-world/coverage',{method:'POST'},405],
    ['/api/forge-world/coverage?project=other',{},400],
    ['/api/forge-world/coverage',{headers:{host:'other.invalid'}},403],
    ['/api/forge-world/coverage',{headers:{host:'127.0.0.1:54321',origin:'https://other.invalid'}},403],
    ['/api/forge-world/coverage',{headers:{host:'127.0.0.1:54321','sec-fetch-site':'cross-site'}},403],
    ['/api/forge-world/coverage',{socket:{remoteAddress:'192.0.2.1'}},403],
  ]) assert.equal((await invoke(handle,path,edits)).status,status);
  assert.equal((await invoke(controller({currentAccount:()=>null}))).status,401);
  assert.equal((await invoke(controller({stateRoot:null}))).status,503);
  assert.equal(reads,0);
});

test('real metadata reader receives only allowed plots, hides samples and preserves observed source time',async t=>{
  const root=await mkdtemp(join(tmpdir(),'sf-worldtree-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const folder=join(root,'operations','forge_world','coverage');await mkdir(folder,{recursive:true});
  const doc=coverage('P26-014');await writeFile(join(folder,'P26-014.json'),JSON.stringify(doc));
  await writeFile(join(folder,'SOULFORGE.json'),'foreign private-shaped malformed input');
  let codes;
  const handle=controller({stateRoot:root,canAccessProject:(_,code)=>code==='P26-014',readerFactory:opts=>{codes=opts.projectCodes;return createWorldCoverageReader(opts);}});
  const response=await invoke(handle),body=JSON.parse(response.body);
  assert.equal(response.status,200);assert.deepEqual(codes,['P26-014']);assert.equal(body.projects.length,1);
  assert.equal(body.projects[0].reason,'sample_hidden');assert.equal(body.projects[0].observed_slots,0);
  assert.equal(response.body.includes('foreign'),false);assert.equal(body.authority_boundary.runtime_authority,false);
  const {generation,...observedBody}=doc;observedBody.source_kind='observed';
  await writeFile(join(folder,'P26-014.json'),JSON.stringify({...observedBody,generation:worldCoverageDigest(observedBody)}));
  const observed=JSON.parse((await invoke(handle)).body).projects[0];
  assert.equal(observed.observed_at,doc.observed_at);assert.equal(observed.source_kind,'observed');
});

test('logout, session rotation and project revocation during metadata IO discard the response',async()=>{
  for(const change of ['logout','session','project']) {
    let account={id:'account.a'},session='a',access=true;
    const handle=controller({currentAccount:()=>account,sessionKey:()=>session,canAccessProject:()=>access,
      readerFactory:opts=>({async readSnapshot(){if(change==='logout')account=null;if(change==='session')session='b';if(change==='project')access=false;
        return {schema_version:'soulforge.forge_world.projects.v1',projects:opts.projectCodes.map(project_code=>({project_code}))};}})});
    const result=await invoke(handle);assert.equal(result.status,change==='project'?403:401);assert.equal(result.body.includes('projects'),false);
  }
});

test('a foreign reader row fails closed and absent authorized data remains unknown',async()=>{
  const foreign=controller({readerFactory:()=>({readSnapshot:async()=>({schema_version:'soulforge.forge_world.projects.v1',projects:[{project_code:'foreign'}]})})});
  assert.equal((await invoke(foreign)).status,503);
  const missing=await invoke(controller({canAccessProject:()=>true}));
  assert.equal(missing.status,200);assert.deepEqual(JSON.parse(missing.body).projects.map(row=>row.state),['unknown','unknown']);
});

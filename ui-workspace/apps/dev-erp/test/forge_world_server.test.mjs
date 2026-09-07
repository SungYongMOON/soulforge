import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { openStore } from '../src/store.mjs';

test('actual server shares world/assets/workbench origin and current login/ACL without runtime effects',{timeout:30000},async t=>{
  const root=await mkdtemp(join(tmpdir(),'sf-world-host-')),dbPath=join(root,'synthetic.db');
  const store=openStore(dbPath);
  store.createAccount({id:'synthetic.viewer',username:'world-viewer',password:'synthetic-world-only',roles:['admin']});
  store.upsertProject({id:'P26-014',title:'합성 화면 검사',data_label:'synthetic'});store.db.close();
  const probe=createServer();probe.listen(0,'127.0.0.1');await once(probe,'listening');
  const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));assert.ok(![4192,4300].includes(port));
  const env={DEV_ERP_NO_TLS:'1',DEV_ERP_NO_REAL_META:'1',DEV_ERP_NO_FIXTURE:'1',DEV_ERP_BACKEND_ROOT:root,DEV_ERP_WORLD_COVERAGE_ROOT:root};
  for(const key of ['PATH','SystemRoot','WINDIR','TEMP','TMP'])if(process.env[key])env[key]=process.env[key];
  const child=spawn(process.execPath,['server.mjs','--port',String(port),'--db',dbPath,'--no-fixture','--no-real-meta','--no-tls','--knowledge_shell_root',root,'--knowledge_dir',root],
    {cwd:fileURLToPath(new URL('..',import.meta.url)),env,windowsHide:true,stdio:['ignore','pipe','pipe']});
  let output='';for(const stream of [child.stdout,child.stderr])stream.on('data',chunk=>{output=(output+chunk).slice(-16384);});
  t.after(async()=>{if(child.exitCode===null){child.kill();await once(child,'exit');}await rm(root,{recursive:true,force:true});});
  const base=`http://127.0.0.1:${port}`,started=Date.now();
  while(true){
    if(child.exitCode!==null)assert.fail(`synthetic server startup failed: ${output}`);
    try{if((await fetch(`${base}/api/health`)).ok)break;}catch{}
    if(Date.now()-started>10000)assert.fail(`synthetic server timeout: ${output}`);
    await new Promise(resolve=>setTimeout(resolve,30));
  }
  for(const route of ['/','/forge-world.html','/forge-world/assets/page.mjs','/forge-world/assets/style.css','/workbench.html']){
    const response=await fetch(base+route);assert.equal(response.status,200,route);
    if(route==='/forge-world.html'){const html=await response.text();assert.match(html,/data-world-host="world-tree"/);assert.match(html,/href="\/workbench.html"/);}
    if(route==='/'){const html=await response.text();assert.match(html,/aria-label="통합 화면"/);assert.match(html,/href="\/forge-world.html"/);assert.match(html,/href="\/workbench.html"/);}
  }
  assert.equal((await fetch(base+'/api/forge-world/coverage')).status,401);
  const login=await fetch(base+'/api/auth/login',{method:'POST',headers:{'content-type':'application/json',origin:base},body:JSON.stringify({username:'world-viewer',password:'synthetic-world-only'})});
  assert.equal(login.status,200);const cookie=login.headers.get('set-cookie').split(';')[0];
  const response=await fetch(base+'/api/forge-world/coverage',{headers:{cookie,'sec-fetch-site':'same-origin'}});
  assert.equal(response.status,200);const body=await response.json();
  assert.deepEqual(body.projects.map(row=>row.project_code),['P26-014']);assert.equal(body.projects[0].state,'unknown');
  assert.equal(body.authority_boundary.runtime_authority,false);
  const catalogue=await fetch(base+'/api/workbench/catalogue',{headers:{cookie,'sec-fetch-site':'same-origin'}});
  assert.equal(catalogue.status,200);assert.equal((await catalogue.json()).hold_code,'INTAKE_DISABLED');
  await fetch(base+'/api/auth/logout',{method:'POST',headers:{cookie,'content-type':'application/json',origin:base},body:'{}'});
  assert.equal((await fetch(base+'/api/forge-world/coverage',{headers:{cookie}})).status,401);
  assert.equal(output.includes('autosync ON'),false);assert.equal(output.includes('아침 브리핑 push ON'),false);
});

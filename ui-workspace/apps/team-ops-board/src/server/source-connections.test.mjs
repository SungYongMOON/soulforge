import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import {readSourceConnections,authenticatedRead,probeTls} from './source-connections.mjs';
function receipt(){const cursor={schema_version:'soulforge.linear_collect.cursor.v1',watermark:null,backfill:null,generation_seq:1};return {schema_version:'soulforge.linear_collect.run_receipt.v1',lane_id:'synthetic',run_id:'run-1',generation_seq:1,mode:'apply',status:'ok',writer_authority_id:'synthetic',writer_epoch:1,binding_sha256:`sha256:${'a'.repeat(64)}`,workspace_url_key:'synthetic',organization_id:'11111111-1111-4111-8111-111111111111',started_at:'2026-09-16T00:00:00.000Z',completed_at:'2026-09-16T00:00:01.000Z',duration_ms:1000,window:{lower:'2026-09-15T00:00:00.000Z',upper:'2026-09-16T00:00:00.000Z',phase:'delta',order_observed:'descending'},cursor_before:{...cursor,generation_seq:0},cursor_after:cursor,read_calls:{total:9,by_operation:Object.fromEntries(['viewer_organization','teams','users','projects','issue_labels','workflow_states','cycles','issues_window','comments_window'].map(s=>['linear.read.'+s,1]))},objects:Object.fromEntries(['workspace','teams','users','projects','labels','states','cycles','issues','comments','read_evidence'].map(s=>[s,{observed:0,created:0,unchanged:0}])),custody_manifest_digest:`sha256:${'b'.repeat(64)}`,coverage_gaps:[],error_codes:[],repository_writes:0,private_writes:3,network_used:true};}
test('authentication observation needs a fresh matching real query, not stale or later failed health',()=>{
 const r=receipt(),h={schema_version:'soulforge.linear_collect.health.v1',status:'ok',last_run_id:r.run_id,completed_at:r.completed_at},now=Date.parse(r.completed_at)+1000;
 assert.ok(authenticatedRead('linear',h,r,now));
 for(const delta of [{status:'error'},{last_run_id:'different'},{completed_at:'2020-01-01T00:00:00Z'}])assert.equal(authenticatedRead('linear',{...h,...delta},r,now),null);
 assert.equal(authenticatedRead('linear',h,{...r,network_used:false},now),null);assert.equal(authenticatedRead('linear',h,r,now+1800000),null);
});
test('connection checks use fixed TLS targets and only the bound loopback liveness URL',async t=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'source-connect-'));t.after(async()=>{assert.equal(path.dirname(root),os.tmpdir());assert.ok(path.basename(root).startsWith('source-connect-'));await rm(root,{recursive:true,force:true});});
 const folder=path.join(root,'config/buzz_history');await mkdir(folder,{recursive:true});const file=path.join(folder,'buzz_collect.binding.json');
 const targets=[],calls=[];const deps={tlsProbe:async id=>{targets.push(id);return {state:'responding',elapsed_ms:1};},fetchImpl:async(url,o)=>{calls.push(url);assert.equal(o.method,'GET');assert.equal(o.redirect,'error');assert.equal(o.credentials,'omit');return {ok:true,body:{cancel:async()=>{}}};}};
 await writeFile(file,JSON.stringify({schema_version:'soulforge.buzz_collect.binding.v1',relay:{liveness_url:'http://127.0.0.1:4321/_liveness'}}));
 const rows=await readSourceConnections(root,deps);assert.deepEqual(targets.sort(),['gmail','linear','slack']);assert.equal(rows.find(r=>r.id==='buzz').state,'responding');assert.equal(calls.length,1);
 await writeFile(file,JSON.stringify({schema_version:'soulforge.buzz_collect.binding.v1',relay:{liveness_url:'https://external.test/leak'}}));
 assert.equal((await readSourceConnections(root,deps)).find(r=>r.id==='buzz').state,'unavailable');assert.equal(calls.length,1);assert.equal((await probeTls('unregistered')).state,'unavailable');
});

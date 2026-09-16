import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm,link} from 'node:fs/promises';import path from 'node:path';import os from 'node:os';
import {inspectCustody,CUSTODY_LIMITS,verifyCustodyObject} from './custody-checks.mjs';
import {sha256Canonical} from '../../../../../guild_hall/shared/project_history_envelope.mjs';
const kinds=['workspace','teams','users','projects','labels','states','cycles','issues','comments','read_evidence'];
const operations=['viewer_organization','teams','users','projects','issue_labels','workflow_states','cycles','issues_window','comments_window'];
async function fixture(t){
 const root=await mkdtemp(path.join(os.tmpdir(),'custody-check-'));t.after(async()=>{assert.equal(path.dirname(root),os.tmpdir());assert.ok(path.basename(root).startsWith('custody-check-'));await rm(root,{recursive:true,force:true});});
 const cursor={schema_version:'soulforge.linear_collect.cursor.v1',watermark:null,backfill:null,generation_seq:1};
 const receipt={schema_version:'soulforge.linear_collect.run_receipt.v1',lane_id:'synthetic-linear',run_id:'run-0001',generation_seq:1,mode:'apply',status:'ok',writer_authority_id:'synthetic-writer',writer_epoch:1,binding_sha256:`sha256:${'1'.repeat(64)}`,workspace_url_key:'synthetic',organization_id:'11111111-1111-4111-8111-111111111111',started_at:'2026-09-16T00:00:00.000Z',completed_at:'2026-09-16T00:00:01.000Z',duration_ms:1000,window:{lower:'2026-09-15T00:00:00.000Z',upper:'2026-09-16T00:00:00.000Z',phase:'delta',order_observed:'descending'},cursor_before:{...cursor,generation_seq:0},cursor_after:cursor,read_calls:{total:9,by_operation:Object.fromEntries(operations.map(k=>['linear.read.'+k,1]))},objects:Object.fromEntries(kinds.map(k=>[k,{observed:0,created:0,unchanged:0}])),custody_manifest_digest:`sha256:${'2'.repeat(64)}`,coverage_gaps:[],error_codes:[],repository_writes:0,private_writes:3,network_used:false};
 const object={id:'item-1',text:'SYNTHETIC_BODY_NOT_TO_SURFACE'},digest=sha256Canonical(object);
 const record={schema_version:'soulforge.linear_collect.custody_object.v1',kind:'issues',object_id:'item-1',content_sha256:digest,object};
 const state={schema_version:'soulforge.linear_collect.state.v1',lane_id:receipt.lane_id,last_run_id:receipt.run_id,writer_authority_id:receipt.writer_authority_id,writer_epoch:1,cursor,object_index:{'issues:item-1':{content_sha256:digest,updated_at:null}}};
 const statePath=path.join(root,'linear_history/state/state/linear-collect.json'),file=path.join(root,`ingress/linear/synthetic/issues/item-1/${digest.slice(7)}.json`);
 const put=async(p,v)=>{await mkdir(path.dirname(p),{recursive:true});await writeFile(p,JSON.stringify(v));};
 await put(statePath,state);await put(path.join(root,'linear_history/state/receipts/run-0001.json'),receipt);await put(file,record);
 return {root,file,state,statePath,record,receipt,put};
}
test('independent byte inspection passes only exact indexed files and never returns payload',async t=>{
 const f=await fixture(t),r=await inspectCustody(f.root,'linear');assert.equal(r.state,'passed',JSON.stringify(r));assert.equal(r.checked,1);assert.equal(r.complete,true);assert.equal(JSON.stringify(r).includes('SYNTHETIC_BODY'),false);
 await f.put(f.file,{...f.record,object:{...f.record.object,text:'altered'}});
 const bad=await inspectCustody(f.root,'linear');assert.equal(bad.state,'failed');assert.deepEqual(bad.codes,['hash_mismatch']);
});
test('missing files, unsafe index paths and hardlinks never pass custody',async t=>{
 const f=await fixture(t);await rm(f.file);assert.equal((await inspectCustody(f.root,'linear')).state,'failed');
 await f.put(f.file,f.record);await link(f.file,path.join(path.dirname(f.file),'copy.json'));assert.notEqual((await inspectCustody(f.root,'linear')).state,'passed');
 await f.put(f.statePath,{...f.state,object_index:{'issues:../escape':{content_sha256:f.record.content_sha256}}});assert.equal((await inspectCustody(f.root,'linear')).state,'unavailable');
});
test('bounded reads cannot become a full healthy aggregate and empty indexes are unconfirmed',async t=>{
 const f=await fixture(t);const small=await inspectCustody(f.root,'linear',{limits:{...CUSTODY_LIMITS,files:3}});assert.equal(small.complete,false);assert.equal(small.checked,0);
 await f.put(f.statePath,{...f.state,object_index:{}});assert.equal((await inspectCustody(f.root,'linear')).state,'unavailable');
 assert.equal(verifyCustodyObject({...f.record,object_id:'foreign'},{lane:'linear',kind:'issues',id:'item-1',digest:f.record.content_sha256}),'identity_mismatch');
});

test('Buzz byte checks remain explicitly sampled even when all selected files match',async t=>{
 const f=await fixture(t),{workspace_url_key,organization_id,...base}=f.receipt;
 const cursor={schema_version:'soulforge.buzz_collect.cursor.v1',received_watermark:null,deleted_watermark:null,audit_seq_max:{},generation_seq:1};
 const receipt={...base,schema_version:'soulforge.buzz_collect.run_receipt.v1',relay_key:'synthetic',community_count:0,window:{received_since:null,deleted_since:null,audit_seq_min:0,phase:'initial'},cursor_before:{...cursor,generation_seq:0},cursor_after:cursor,read_calls:{total:2,by_operation:{'buzz.read.liveness':1,'buzz.read.export':1}},process_calls:1,objects:Object.fromEntries(['events','tombstones','audit','snapshots'].map(k=>[k,{observed:0,created:0,unchanged:0}])),export_digests:Object.fromEntries(['events','tombstones','audit','snapshot'].map(k=>[k,`sha256:${'3'.repeat(64)}`]))};
 await f.put(path.join(f.root,'buzz_history/state/state/buzz-collect.json'),{...f.state,schema_version:'soulforge.buzz_collect.state.v1',cursor});
 await f.put(path.join(f.root,'buzz_history/state/receipts/run-0001.json'),receipt);
 for(const kind of ['events','tombstones','audit','snapshots'])await f.put(path.join(f.root,`ingress/buzz/synthetic/${kind}/item-1/${f.record.content_sha256.slice(7)}.json`),{...f.record,schema_version:'soulforge.buzz_collect.custody_object.v1',kind});
 const r=await inspectCustody(f.root,'buzz');assert.equal(r.state,'sampled',JSON.stringify(r));assert.equal(r.checked,4);assert.equal(r.complete,false);assert.equal(r.expected,null);
});

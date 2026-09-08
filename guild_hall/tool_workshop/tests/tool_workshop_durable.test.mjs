import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, unlinkSync, existsSync, writeFileSync, readFileSync, statSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createDurableToolWorkshop } from '../src/tool_workshop_durable.mjs';
import { DOCUMENT_WORKSHOP_PROFILE } from '../src/tool_workshop_core.mjs';

const input = (id = 'job.one') => ({job_id:id, workshop_id:'workshop.document', task_ref:'task.synthetic', work_brief_ref:'brief.synthetic', project_ref:'project.synthetic', priority:2, required_tool_version:'tool.docx_renderer:v1', input_bundle_manifest_digest:'a'.repeat(64), timeout_seconds:60,max_retries:1});

test('read-only custody lookup neither repairs empty state nor exposes writer operations',()=>{
  const stateRoot=mkdtempSync(path.join(tmpdir(),'workshop-read-only-'));
  const queue=createDurableToolWorkshop({stateRoot,mode:'create_new'});
  queue.registerWorkshop(DOCUMENT_WORKSHOP_PROFILE); queue.submitJob(input());
  const file=path.join(stateRoot,'workshop.sqlite'),before=readFileSync(file);
  const reader=createDurableToolWorkshop({stateRoot,mode:'open_existing',readOnly:true});
  assert.equal(reader.getJob('job.one').job_id,'job.one');
  assert.equal(reader.registerWorkshop,undefined);assert.equal(reader.acquireLease,undefined);
  assert.deepEqual(readFileSync(file),before);
  const wal=new DatabaseSync(file);wal.exec('PRAGMA journal_mode=WAL');wal.close();
  const walBytes=readFileSync(file);
  assert.equal(existsSync(file+'-wal'),false);assert.equal(existsSync(file+'-shm'),false);
  assert.throws(()=>createDurableToolWorkshop({stateRoot,mode:'open_existing',readOnly:true}),{code:'state_read_only_wal_unsupported'});
  assert.deepEqual(readFileSync(file),walBytes);
  assert.equal(existsSync(file+'-wal'),false);assert.equal(existsSync(file+'-shm'),false);
  writeFileSync(file,Buffer.alloc(0));
  assert.throws(()=>createDurableToolWorkshop({stateRoot,mode:'open_existing',readOnly:true}),{code:'state_read_only_schema'});
  assert.equal(statSync(file).size,0);
  unlinkSync(path.join(stateRoot,'workshop.initialized'));
  assert.throws(()=>createDurableToolWorkshop({stateRoot,mode:'open_existing',readOnly:true}),{code:'state_marker_missing'});
  assert.equal(existsSync(path.join(stateRoot,'workshop.initialized')),false);
  assert.throws(()=>createDurableToolWorkshop({stateRoot,readOnly:true}),{code:'state_read_only_mode'});
});
test('durable journal replays queue and monotonically fences an expired runner', () => {
  const stateRoot = mkdtempSync(path.join(tmpdir(),'workshop-durable-'));
  let queue = createDurableToolWorkshop({stateRoot});
  queue.registerWorkshop(DOCUMENT_WORKSHOP_PROFILE);
  queue.submitJob(input());
  const stale = queue.acquireLease('workshop.document',{now:'2026-09-07T00:00:00Z',lease_id:'lease.one'});
  queue = createDurableToolWorkshop({stateRoot,mode:'open_existing'});
  assert.equal(queue.getJob('job.one').state,'leased');
  queue.submitJob(input('job.two'));
  const fresh = queue.acquireLease('workshop.document',{now:'2026-09-07T00:02:00Z',lease_id:'lease.two'});
  assert.equal(fresh.fencing_token, stale.fencing_token+1);
  assert.throws(() => queue.assertCurrentLease(stale,'2026-09-07T00:02:00Z'), {code:'fence_stale'});
  assert.equal(queue.getCustodyReceipt('job.one'),null);
});

function child(code,args) {
  return new Promise((resolve,reject)=>{
    const processChild=spawn(process.execPath,['--input-type=module','-e',code,...args],{windowsHide:true,stdio:['ignore','pipe','pipe']});
    let stdout='',stderr='';
    processChild.stdout.on('data',value=>stdout+=value);
    processChild.stderr.on('data',value=>stderr+=value);
    processChild.on('error',reject);
    processChild.on('close',code=>resolve({code,stdout,stderr}));
  });
}

test('four processes contend on one queue: one submission and one lease, no double-run',async()=>{
  const stateRoot=mkdtempSync(path.join(tmpdir(),'workshop-concurrent-'));
  const queue=createDurableToolWorkshop({stateRoot});queue.registerWorkshop(DOCUMENT_WORKSHOP_PROFILE);
  const source=new URL('../src/tool_workshop_durable.mjs',import.meta.url).href;
  const submissions=await Promise.all(Array.from({length:4},()=>child(`import {createDurableToolWorkshop} from ${JSON.stringify(source)};try {const q=createDurableToolWorkshop({stateRoot:process.argv[1]});q.submitJob(JSON.parse(process.argv[2]));console.log('ok');} catch(e){console.log(e.code);}`, [stateRoot,JSON.stringify(input())])));
  assert.equal(submissions.filter(entry=>entry.stdout.trim()==='ok').length,1);
  assert.equal(submissions.filter(entry=>entry.stdout.trim()==='job_duplicate').length,3);
  const acquisitions=await Promise.all(Array.from({length:4},(_,index)=>child(`import {createDurableToolWorkshop} from ${JSON.stringify(source)};const q=createDurableToolWorkshop({stateRoot:process.argv[1]});console.log(JSON.stringify(q.acquireLease('workshop.document',{now:'2026-09-07T00:00:00Z',lease_id:process.argv[2]})));`,[stateRoot,`lease.concurrent.${index}`])));
  assert(acquisitions.every(entry=>entry.code===0),JSON.stringify(acquisitions));
  assert.equal(acquisitions.filter(entry=>entry.stdout.trim()!=='null').length,1);
  assert.equal(queue.eventLog().filter(entry=>entry.kind==='lease_acquired').length,1);
});

test('malformed commands and corrupted journal are fail closed, without queue mutation',()=>{
  const stateRoot=mkdtempSync(path.join(tmpdir(),'workshop-corrupt-'));
  const queue=createDurableToolWorkshop({stateRoot});queue.registerWorkshop(DOCUMENT_WORKSHOP_PROFILE);
  assert.throws(()=>queue.submitJob({...input(),raw_body:'do not persist'}),{code:'unexpected_fields'});
  assert.throws(()=>queue.submitJob({...input(),timeout_seconds:301}),{code:'timeout_limit_exceeded'});
  assert.equal(queue.getJob('job.one'),null);
  const db=new DatabaseSync(path.join(stateRoot,'workshop.sqlite'));
  db.prepare('UPDATE journal SET command = ? WHERE seq = 1').run('{}');db.close();
  assert.throws(()=>createDurableToolWorkshop({stateRoot}),{code:'journal_integrity_failed'});
});

test('clock expiry rejects completion even before another runner takes over',()=>{
  const stateRoot=mkdtempSync(path.join(tmpdir(),'workshop-expiry-'));
  const queue=createDurableToolWorkshop({stateRoot});queue.registerWorkshop(DOCUMENT_WORKSHOP_PROFILE);queue.submitJob(input());
  const lease=queue.acquireLease('workshop.document',{now:'2026-09-07T00:00:00Z',lease_id:'lease.one'});
  assert.throws(()=>queue.assertCurrentLease(lease,'2026-09-07T00:01:00Z'),{code:'lease_expired'});
  assert.equal(queue.getCustodyReceipt('job.one'),null);
});

test('an established missing main database or marker is never silently recreated',()=>{
  const stateRoot=mkdtempSync(path.join(tmpdir(),'workshop-missing-state-'));
  const queue=createDurableToolWorkshop({stateRoot});queue.registerWorkshop(DOCUMENT_WORKSHOP_PROFILE);queue.submitJob(input());
  const file=path.join(stateRoot,'workshop.sqlite');
  unlinkSync(file);
  assert.throws(()=>queue.getJob('job.one'),{code:'state_database_missing'});
  assert.throws(()=>createDurableToolWorkshop({stateRoot}),{code:'state_database_missing'});
  assert.equal(existsSync(file),false);
  unlinkSync(path.join(stateRoot,'workshop.initialized'));
  assert.throws(()=>createDurableToolWorkshop({stateRoot,mode:'open_existing'}),{code:'state_database_missing'});
  assert.equal(existsSync(file),false);
  const separate=mkdtempSync(path.join(tmpdir(),'workshop-missing-marker-'));
  const other=createDurableToolWorkshop({stateRoot:separate});
  unlinkSync(path.join(separate,'workshop.initialized'));
  assert.throws(()=>other.getJob('job.one'),{code:'ENOENT'});
  assert.throws(()=>createDurableToolWorkshop({stateRoot:separate,mode:'create_new'}),{code:'state_already_exists'});
});

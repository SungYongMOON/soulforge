import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {runProbe} from './watchtower.mjs';
import {completedWatchtowerDiagnostic} from './recovery_runtime.mjs';
import {topologySkeleton} from './topology.mjs';

test('a large JSONL history still yields its bounded latest status; incomplete latest records never reuse success',async t=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'watchtower-tail-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const file=path.join(root,'history.jsonl');const now=Date.now();
  const old=JSON.stringify({padding:'x'.repeat(1024)})+'\n';
  const latest=JSON.stringify({observed_at:new Date(now).toISOString(),status:'ok'})+'\n';
  await writeFile(file,old.repeat(4200)+latest);
  const probe={kind:'jsonl_tail',path:file,timestamp_field:'observed_at',status_field:'status',ok_values:['ok'],period_seconds:60,grace_seconds:60};
  const result=await runProbe(probe,{now});assert.equal(result.state,'ok');
  await writeFile(file,old.repeat(4200)+latest+'{"unfinished":');
  assert.notEqual((await runProbe(probe,{now})).state,'ok');
  await writeFile(file,'x'.repeat(4*1024*1024+100));
  assert.ok((await runProbe(probe,{now})).reasons.includes('source_too_large'));
});
test('completed down report is distinct from a failed Watchtower process',()=>{
  const skeleton=topologySkeleton();
  const snapshot={...skeleton,schema_version:'soulforge.watchtower.topology_health.v2',observed_at:new Date().toISOString(),summary:{down:1}};
  const stdout=JSON.stringify(snapshot);
  assert.deepEqual(completedWatchtowerDiagnostic({code:2,stdout}),snapshot);
  assert.equal(completedWatchtowerDiagnostic({code:1,stdout}),null);
  assert.equal(completedWatchtowerDiagnostic({code:2,stdout:'{broken'}),null);
  assert.equal(completedWatchtowerDiagnostic({code:2,stdout:JSON.stringify({...snapshot,summary:{down:0}})}),null);
});

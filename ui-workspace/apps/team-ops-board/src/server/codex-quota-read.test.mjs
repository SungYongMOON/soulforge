import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {PassThrough,Writable} from 'node:stream';
import {projectCodexQuota,readCodexQuota} from './codex-quota-read.mjs';
import {dashboardQuotas} from '../core/operations-dashboard-view.mjs';
const result={rateLimitsByLimitId:{codex:{primary:{usedPercent:23,windowDurationMins:10080,resetsAt:1900000000},credits:{secret:'must-not-project'}}}};
test('official quota replaces stale session telemetry without inventing a five-hour window',()=>{
  const now=Date.parse('2026-09-16T04:00:00Z'),direct=projectCodexQuota(result,new Date(now).toISOString());
  const rows=dashboardQuotas({codexQuota:direct,limits:{codex:{primary:{used_percent:2,window_minutes:10080,resets_at_epoch_s:1900000000},observed_at:'2026-09-15T00:00:00Z'}}},[],now).filter(r=>r.provider==='Codex');
  assert.equal(rows.length,1);assert.equal(rows[0].remaining,77);assert.equal(rows[0].current,true);assert.equal(JSON.stringify(direct).includes('secret'),false);
  assert.equal(projectCodexQuota({rateLimits:{primary:{usedPercent:NaN}}}).state,'unavailable');
  assert.equal(projectCodexQuota({rateLimitsByLimitId:{images:result.rateLimitsByLimitId.codex},rateLimits:result.rateLimitsByLimitId.codex}).state,'unavailable');
});
function fake(reply){const methods=[];let killed=0;const child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();child.stdin=new Writable({write(chunk,_encoding,done){const message=JSON.parse(chunk.toString());methods.push(message.method);queueMicrotask(()=>reply?.(message,child));done();}});child.kill=()=>{killed++;child.stdout.end();child.stderr.end();};return {child,methods,get killed(){return killed;}};}
test('reader only initializes and reads account limits, then closes its own helper',async()=>{
  const f=fake((m,c)=>{if(m.id===1)c.stdout.write('{"id":1,"result":{}}\n');if(m.id===2)c.stdout.write(JSON.stringify({id:2,result})+'\n');});
  const value=await readCodexQuota({spawnImpl:()=>f.child,spawnSpec:{command:'fake',args:[]}});assert.equal(value.state,'ready');assert.deepEqual(f.methods,['initialize','initialized','account/rateLimits/read']);assert.equal(f.killed,1);
});
test('timeout and oversized responses fail closed and terminate only the spawned helper',async()=>{
  const f=fake();assert.equal((await readCodexQuota({spawnImpl:()=>f.child,spawnSpec:{},timeoutMs:5})).reason,'quota_read_timeout');assert.equal(f.killed,1);
  const g=fake((_m,c)=>c.stdout.write('x'.repeat(1024*1024+1)));assert.equal((await readCodexQuota({spawnImpl:()=>g.child,spawnSpec:{}})).reason,'quota_response_limit');assert.equal(g.killed,1);
});

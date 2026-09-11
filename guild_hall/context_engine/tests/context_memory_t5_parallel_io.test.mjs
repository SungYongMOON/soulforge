// Real FD reads/closes with independently released gates. No post-response release.
import test from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import { join } from 'node:path';
import { syncBuiltinESMExports } from 'node:module';
// APP CLI main; the dev-ERP haengbogwan delegation is deferred on main (CTX-S0-G2).
import { main } from '../src/app.mjs';
import { materializeT5 } from '../harness/fixtures/context_memory_t5_fixture.mjs';

test('T5 parallel derived failure waits for every started read and close before reporting IO',async()=>{
  const x=await materializeT5();
  const pathFor=id=>join(x.root,x.assets.find(a=>a.id===id).path);
  const indexPath=pathFor('index:project'),closePath=pathFor('projection:project');
  const heldPaths=new Set(['projection','policy','summary','evaluation','episode','input'].map(k=>pathFor(k+':project')));
  const bodyEntered=Promise.withResolvers(),bodyGate=Promise.withResolvers();
  const closeEntered=Promise.withResolvers(),closeGate=Promise.withResolvers(),drained=Promise.withResolvers();
  const observed={bytes:0,loads:new Set(),opens:0,closes:0};
  const events=[];let stdout='',stderr='',atReturn;
  const original=fsp.open;
  const watchdog=setTimeout(()=>{
    bodyGate.resolve();closeGate.resolve();bodyEntered.resolve();closeEntered.resolve();
    drained.reject(new Error('parallel IO regression did not drain'));
  },10000);
  fsp.open=async function(path,...args){
    if(String(path)===indexPath)throw Object.assign(new Error('synthetic index ENOENT'),{code:'ENOENT'});
    const fd=await original.call(this,path,...args);observed.opens++;
    const read=fd.read.bind(fd),close=fd.close.bind(fd);
    fd.read=async(...readArgs)=>{
      if(heldPaths.has(String(path))){bodyEntered.resolve();await bodyGate.promise;}
      const result=await read(...readArgs);observed.bytes+=result.bytesRead;observed.loads.add(String(path));
      return result;
    };
    fd.close=async()=>{
      if(String(path)===closePath){closeEntered.resolve();await closeGate.promise;}
      try{return await close();}finally{
        observed.closes++;events.push('close');if(observed.closes===8)drained.resolve();
      }
    };
    return fd;
  };syncBuiltinESMExports();
  // Release from the independent controller, never from awaiting the response.
  const release=(async()=>{
    await bodyEntered.promise;await new Promise(resolve=>setImmediate(resolve));bodyGate.resolve();
    await closeEntered.promise;await new Promise(resolve=>setImmediate(resolve));closeGate.resolve();
  })();
  try {
    const exit=await main(['--root',x.root,'--binding-sha256',x.bindingSha256,
      '--request-json',JSON.stringify(x.request),'--synthetic-only'],{stdout:{write:s=>stdout+=s},stderr:{write:s=>stderr+=s}});
    atReturn={bytes:observed.bytes,loads:observed.loads.size,closes:observed.closes};events.push('response');
    await release;await drained.promise;
    const pack=JSON.parse(stdout);
    assert.equal(exit,0,stderr);assert.equal(pack.status,'NOT_AVAILABLE');assert.equal(pack.digest,null);
    assert.equal(observed.opens,8);assert.equal(atReturn.closes,observed.opens,'response preceded sibling FD closure');
    assert.equal(events.at(-1),'response');
    assert.equal(pack.metrics.derived_bytes_loaded,observed.bytes,'bytes changed after response');
    assert.equal(pack.metrics.derived_body_loads,observed.loads.size,'loads changed after response');
    assert.equal(pack.metrics.derived_read_attempts,9);
    assert.equal(pack.metrics.source_bytes_loaded,0);
    assert.deepEqual(pack.facts,[]);assert.deepEqual(pack.evidence,[]);
  }finally{
    bodyGate.resolve();closeGate.resolve();clearTimeout(watchdog);
    fsp.open=original;syncBuiltinESMExports();
  }
});

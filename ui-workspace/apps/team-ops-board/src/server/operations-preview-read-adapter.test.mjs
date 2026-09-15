import test from 'node:test';
import assert from 'node:assert/strict';
import { createOperationsPreviewReadPlugin } from './operations-preview-read-adapter.mjs';

function harness(fetchImpl) {
  let handler;
  createOperationsPreviewReadPlugin({fetchImpl}).configureServer({middlewares:{use(fn){handler=fn;}}});
  return (url,method='GET',headers={})=>new Promise(resolve=>{
    const response={statusCode:200,setHeader(){},end(body){resolve({status:this.statusCode,body});}};
    handler({url,method,headers,socket:{remoteAddress:'127.0.0.1'}},response,()=>resolve({next:true}));
  });
}
test('preview reads only fixed installed snapshot routes, drops force/target queries and caches',async()=>{
  const calls=[];const read=harness(async(url,options)=>{calls.push({url,options});return new Response('{"state":"observed"}',{headers:{'content-type':'application/json'}});});
  assert.equal((await read('/host-stats.snapshot.json?refresh=1&url=https://external.invalid')).status,200);
  await read('/host-stats.snapshot.json');assert.equal(calls.length,1);
  assert.equal(calls[0].url,'http://127.0.0.1:4192/host-stats.snapshot.json');assert.equal(calls[0].options.method,'GET');
  assert.equal(calls[0].options.redirect,'error');assert.deepEqual(await read('/unregistered.json'),{next:true});
  await read('/agent-runtime.snapshot.json?refresh=1');assert.equal(calls[1].url,'http://127.0.0.1:4192/agent-runtime.snapshot.json?read_only=1');
  assert.equal((await read('/host-stats.snapshot.json','POST')).status,405);
  assert.equal((await read('/host-stats.snapshot.json','GET',{'forwarded':'for=external'})).status,403);
});
test('failed source cannot be silently retained as current or exposed as raw error',async()=>{
  const read=harness(async()=>{throw new Error('private source failure');});
  const result=await read('/host-stats.snapshot.json');assert.equal(result.status,503);assert.equal(result.body,'{"state":"unavailable"}');
});

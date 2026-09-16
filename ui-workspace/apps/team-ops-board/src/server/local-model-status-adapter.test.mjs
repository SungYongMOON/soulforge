import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {admittedModelOrigin,inspectModelTarget,createLocalModelStatusReader,createLocalModelStatusPlugin} from './local-model-status-adapter.mjs';
const target={id:'synthetic-host',label:'Synthetic host',origin:'http://127.0.0.1:9999',transport:'ollama',expected:[{model:'test:8b',roles:['임베딩']}]};
const response=value=>({ok:true,status:200,json:async()=>value});
test('model origin refuses credentials, redirects-to-path, arbitrary hosts and plaintext remote addresses',()=>{
  for(const v of ['file:///etc/passwd','http://remote.example','https://remote.example','http://u:p@127.0.0.1:9999','http://127.0.0.1:9999/path','http://127.0.0.1:9999/?x=1'])assert.equal(admittedModelOrigin(v),null);
  assert.equal(admittedModelOrigin('https://model.example',['https://model.example']),'https://model.example');
});
test('installed but unloaded Ollama model is not a dead server or a successful inference',async()=>{
  const calls=[];const result=await inspectModelTarget(target,{fetchImpl:async(url,opts)=>{calls.push([new URL(url).pathname,opts.method]);return response(url.endsWith('/api/version')?{version:'test'}:url.endsWith('/api/tags')?{models:[{name:'test:8b',private_field:'never output'}]}:{models:[]});}});
  assert.equal(result.connection,'responding');assert.equal(result.models[0].registered,true);assert.equal(result.models[0].resident,false);assert.equal(result.resident_count,0);assert.equal(result.inference,'not_tested');
  assert.deepEqual(calls.map(c=>c[0]).sort(),['/api/ps','/api/tags','/api/version']);assert.ok(calls.every(c=>c[1]==='GET'));assert.ok(!JSON.stringify(result).includes('private_field'));
});
test('refused, malformed and incomplete observations remain distinct; no false zero for residency',async()=>{
  const refused=await inspectModelTarget(target,{fetchImpl:async()=>{throw Object.assign(new Error('private location'),{code:'ECONNREFUSED'});}});assert.equal(refused.connection,'refused');assert.equal(refused.registered_count,null);assert.equal(refused.models[0].resident,null);assert.ok(!JSON.stringify(refused).includes('private location'));
  const malformed=await inspectModelTarget(target,{fetchImpl:async()=>response({wrong:true})});assert.equal(malformed.connection,'unknown');assert.equal(malformed.resident_count,null);
  const mixed=await inspectModelTarget(target,{fetchImpl:async url=>url.endsWith('/api/ps')?{ok:false,status:503}:response(url.endsWith('/api/tags')?{models:[{name:'test:8b'}]}:{version:'test'})});assert.equal(mixed.connection,'responding');assert.equal(mixed.models[0].resident,null);
});
test('OpenAI-compatible model listing does not invent accelerator residency',async()=>{
  const value=await inspectModelTarget({...target,transport:'openai_chat'},{fetchImpl:async url=>response(url.endsWith('/health')?{status:'ok'}:{data:[{id:'test:8b'}]})});assert.equal(value.connection,'responding');assert.equal(value.models[0].registered,true);assert.equal(value.models[0].resident,null);assert.equal(value.models[0].accelerator_bytes,null);
});
test('shared binding targets are deduplicated, cached and revoked on root pin drift',async t=>{
  const dir=await mkdtemp(path.join(tmpdir(),'model-status-'));t.after(async()=>{assert.equal(path.dirname(path.resolve(dir)),path.resolve(tmpdir()));assert.ok(path.basename(dir).startsWith('model-status-'));await rm(dir,{recursive:true,force:true});});
  const control=path.join(dir,'control');for(const p of ['P1-A','P1-B']){const folder=path.join(control,'project-bindings',p);await mkdir(folder,{recursive:true});await writeFile(path.join(folder,'graph_index_binding.unified.json'),JSON.stringify({graph:{allowed_model_hosts:['https://model.example'],llm:{host:'https://model.example',model:'test:8b'},embedder:{host:'https://model.example',model:'test:8b'}}}));}
  const tablePath=path.join(dir,'roots.json'),bytes=JSON.stringify({schema_version:'soulforge.physical_root_table.v0',roots:{control_root:control}});await writeFile(tablePath,bytes);let calls=0;
  const reader=createLocalModelStatusReader({tablePath,expectedSha256:`sha256:${createHash('sha256').update(bytes).digest('hex')}`,projects:['P1-A','P1-B'],fetchImpl:async url=>{calls++;return response(url.endsWith('/api/version')?{version:'test'}:{models:[{name:'test:8b'}]});}});
  const first=await reader.read();assert.equal(first.hosts.length,1);assert.deepEqual(first.hosts[0].models[0].roles,['추출 LLM','임베딩']);assert.equal(calls,3);assert.equal((await reader.read()).cached,true);assert.equal(calls,3);
  await writeFile(tablePath,'{}');const revoked=await reader.read();assert.equal(revoked.state,'partial');assert.equal(revoked.hosts.length,0);assert.equal(calls,3);
});
test('HTTP refuses target overrides, mutations, cross-origin callers and rebinding hosts',()=>{
  let handler;createLocalModelStatusPlugin().configureServer({middlewares:{use(fn){handler=fn;}}});
  for(const [url,method,headers,expected] of [['/local-model-status.json?url=http://other','GET',{host:'127.0.0.1:4194'},400],['/local-model-status.json','POST',{host:'127.0.0.1:4194'},405],['/local-model-status.json','GET',{host:'evil.example'},403],['/local-model-status.json','GET',{host:'127.0.0.1:4194',origin:'https://evil.example'},403]]){const res={statusCode:200,setHeader(){},end(){}};handler({url,method,headers,socket:{remoteAddress:'127.0.0.1'}},res,()=>assert.fail());assert.equal(res.statusCode,expected);}
});

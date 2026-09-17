import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createOperationsDirectoryReader, createOperationsDirectoryPlugin } from './operations-directory-adapter.mjs';

async function fixture(t) {
  const home = await mkdtemp(path.join(tmpdir(), 'operations-directory-test-'));
  t.after(() => rm(home, { recursive: true, force: true }));
  const root = path.join(home,'data'); await mkdir(root);
  const secret = path.join(home,'secret'); await mkdir(secret);
  const tablePath = path.join(home,'roots.json');
  const bytes = JSON.stringify({ schema_version:'soulforge.physical_root_table.v0',roots:{ data_root:root, secret_owner_root:secret } });
  await writeFile(tablePath,bytes);
  return { root, tablePath, expectedSha256:`sha256:${createHash('sha256').update(bytes).digest('hex')}` };
}
test('directory is direct-child metadata, excludes protected names, preserves cached scan time', async t => {
  const f = await fixture(t); await mkdir(path.join(f.root,'folder')); await writeFile(path.join(f.root,'folder','nested.txt'),'inner');
  await writeFile(path.join(f.root,'safe.txt'),'abc'); await writeFile(path.join(f.root,'.env'),'never return');
  await mkdir(path.join(f.root,'credentials')); let time = Date.now();
  const reader = createOperationsDirectoryReader({ ...f,now:()=>time });
  assert.deepEqual((await reader.read()).roots,['data_root']);
  const first = await reader.read({root:'data_root'});
  assert.equal(first.state,'ready'); assert.equal(first.excluded,2);
  assert.deepEqual(first.entries.map(e=>e.name),['folder','safe.txt']);
  assert.equal(first.entries[0].size,null); assert.equal(first.entries[1].size,3); assert.equal(first.total_size,null);
  time += 1000; const second = await reader.read({root:'data_root'}); assert.equal(second.cached,true); assert.equal(first.scanned_at,second.scanned_at);
  assert.equal(JSON.stringify(first).includes(f.root),false); assert.equal(JSON.stringify(first).includes('never return'),false);
});
test('traversal, absolute paths, ADS, protected root and symlink escape fail closed', async t => {
  const f = await fixture(t); const reader = createOperationsDirectoryReader(f);
  for (const relative of ['..','../secret',['C:',''].join('/'),'safe.txt:stream','a\\b','credentials','.env','a.','a ']) assert.equal((await reader.read({root:'data_root',relative})).state,'denied');
  assert.equal((await reader.read({root:'secret_owner_root'})).state,'denied');
  await symlink(path.dirname(f.root),path.join(f.root,'escape'),'junction');
  assert.equal((await reader.read({root:'data_root',relative:'escape'})).state,'denied');
  const result = await reader.read({root:'data_root'}); assert.equal(result.entries[0].browsable,false);
});
test('bounded enumeration is partial, table changes invalidate even cached reads',async t=>{
  const f = await fixture(t); for(let i=0;i<5;i++)await writeFile(path.join(f.root,`${i}.txt`),'x');
  const reader = createOperationsDirectoryReader({...f,maxEntries:2}); const result = await reader.read({root:'data_root'});
  assert.equal(result.state,'partial'); assert.equal(result.truncated,true); assert.equal(result.entries.length,2);
  await writeFile(f.tablePath,'{}'); assert.equal((await reader.read({root:'data_root'})).state,'unavailable');
});
test('HTTP rejects mutation, proxy, cross-origin and rebinding hosts',async()=>{
  let middleware; createOperationsDirectoryPlugin().configureServer({middlewares:{use(fn){middleware=fn;}}});
  for(const [method,headers,code] of [['POST',{host:'localhost:4194'},405],['GET',{host:'evil.test'},403],['GET',{host:'localhost:4194','x-forwarded-for':'1.2.3.4'},403],['GET',{host:'localhost:4194',origin:'https://evil.test'},403]]){
    const response={statusCode:200,setHeader(){},end(){}}; middleware({url:'/operations-directory.json',method,headers,socket:{remoteAddress:'127.0.0.1'}},response,()=>assert.fail('passed through'));
    assert.equal(response.statusCode,code);
  }
});

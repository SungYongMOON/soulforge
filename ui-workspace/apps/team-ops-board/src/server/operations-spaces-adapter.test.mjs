import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm,symlink,link} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createOperationsSpacesReader,createOperationsSpacesPlugin,safePreviewRelative,previewExtract} from './operations-spaces-adapter.mjs';

async function fixture(t){
  const folder=await mkdtemp(path.join(tmpdir(),'operations-spaces-'));
  t.after(async()=>{const resolved=path.resolve(folder);assert.equal(path.dirname(resolved),path.resolve(tmpdir()));assert.ok(path.basename(resolved).startsWith('operations-spaces-'));await rm(resolved,{recursive:true,force:true});});
  const root=path.join(folder,'data');await mkdir(path.join(root,'ingress/team_files'),{recursive:true});
  const bytes=JSON.stringify({schema_version:'soulforge.physical_root_table.v0',roots:{data_root:root}}),tablePath=path.join(folder,'roots.json');await writeFile(tablePath,bytes);
  const options={tablePath,expectedSha256:`sha256:${createHash('sha256').update(bytes).digest('hex')}`,projects:['P24-049']};
  return {folder,root,options,reader:createOperationsSpacesReader(options),docs:path.join(root,'ingress/team_files')};
}
test('pinned spaces expose direct metadata, text is opened only explicitly and source bytes remain unchanged',async t=>{
  const f=await fixture(t);const content='<script>never execute</script>';await writeFile(path.join(f.docs,'note.html'),content);
  const catalog=await f.reader.read();assert.ok(catalog.spaces.some(s=>s.id==='docs'));assert.ok(catalog.spaces.some(s=>s.id==='memory'));
  const listing=await f.reader.read({space:'docs'});assert.equal(listing.state,'ready');assert.equal(JSON.stringify(listing).includes(content),false);
  const preview=await f.reader.read({space:'docs',relative:'note.html',file:true});assert.equal(preview.kind,'text');assert.equal(preview.text,content);assert.equal(preview.size,Buffer.byteLength(content));
  assert.equal(JSON.stringify(preview).includes(f.root),false);
});
test('file preview denies traversal, secret names, ADS, links, oversized and forged image bytes',async t=>{
  const f=await fixture(t);
  for(const p of ['../a','/a','C:/a','a\\b','a:stream','a.','a ','x/.env','secret.txt','credentials.json','session.json','config.json']){assert.equal(safePreviewRelative(p),false,p);assert.equal((await f.reader.read({space:'docs',relative:p,file:true})).state,'denied');}
  await writeFile(path.join(f.docs,'big.txt'),Buffer.alloc(512*1024+1,65));assert.equal((await f.reader.read({space:'docs',relative:'big.txt',file:true})).state,'unavailable');
  await writeFile(path.join(f.docs,'bad.png'),'not image');assert.equal((await f.reader.read({space:'docs',relative:'bad.png',file:true})).state,'denied');
  await mkdir(path.join(f.folder,'outside'));await writeFile(path.join(f.folder,'outside','safe.txt'),'outside');await symlink(path.join(f.folder,'outside'),path.join(f.docs,'escape'),'junction');assert.equal((await f.reader.read({space:'docs',relative:'escape/safe.txt',file:true})).state,'unavailable');
  await writeFile(path.join(f.docs,'one.txt'),'one');await link(path.join(f.docs,'one.txt'),path.join(f.docs,'two.txt'));assert.equal((await f.reader.read({space:'docs',relative:'two.txt',file:true})).state,'unavailable');
});
test('table pin is checked for every file and cached directory; unknown project and invalid manual queries are refused',async t=>{
  const f=await fixture(t);assert.equal((await f.reader.read({space:'memory',project:'P99-999'})).state,'denied');
  assert.equal((await f.reader.query({project:'P24-049',question:'test',investigation:'../escape'})).state,'denied');
  await f.reader.read({space:'docs'});await writeFile(f.options.tablePath,'{}');assert.equal((await f.reader.read({space:'docs'})).state,'unavailable');assert.equal((await f.reader.recent()).state,'unavailable');
});
test('recent projection separates registration from RAG success and excludes payload refs',async t=>{
  const f=await fixture(t);const dir=path.join(f.root,'ingress/plaud/library/index');await mkdir(dir,{recursive:true});await writeFile(path.join(dir,'recordings.current.json'),JSON.stringify({schema_version:'soulforge.voice_recording_library_index.v0',generated_at:'2026-09-15T00:00:00Z',recordings:[{recording_id:'r1',registered_at_kst:'2026-09-15T00:00:00Z',payload_refs:{secret:'must not leave'},status_summary:{ok:true,transcript_segments:2}}]}));
  const result=await f.reader.recent();assert.equal(result.rows[0].segments,2);assert.equal(result.rows[0].status,'자료 등록 · 처리 기록 있음');assert.equal(JSON.stringify(result).includes('must not leave'),false);
});
test('manual search requires same-origin POST JSON; ordinary reads never accept POST',()=>{
  let middleware;createOperationsSpacesPlugin().configurePreviewServer({middlewares:{use(f){middleware=f;}}});
  for(const [url,method,headers,code] of [['/operations-query.json','GET',{host:'127.0.0.1:4194'},405],['/operations-query.json','POST',{host:'evil.test'},403],['/operations-query.json','POST',{host:'127.0.0.1:4194',origin:'https://other.test'},403],['/operations-query.json','POST',{host:'127.0.0.1:4194'},415],['/operations-file.json','POST',{host:'127.0.0.1:4194'},405]]){
    const res={statusCode:200,setHeader(){},end(){}};middleware({url,method,headers,socket:{remoteAddress:'127.0.0.1'}},res,()=>assert.fail());assert.equal(res.statusCode,code);
  }
});
test('document extract preview preserves failure and bounds text without executing markup',()=>{
  assert.equal(previewExtract({status:'error',text:'bad'}),null);
  assert.equal(previewExtract({status:'ok',pages:[{page:1,text:'<script>text only</script>'}]}),'페이지 1\n<script>text only</script>');
  assert.match(previewExtract({status:'ok',sheets:[{sheet:'Sheet 1',truncated:true,cells:[{ref:'A1',value:42}]}]}),/일부 셀\nA1: 42/u);
  assert.equal(previewExtract({status:'ok',text:'a'.repeat(300000)}).length,256*1024);
});

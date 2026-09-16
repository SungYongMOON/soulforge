import path from 'node:path';
import {lstat,realpath,opendir} from 'node:fs/promises';
import {readBoundedFile} from '../../../../../guild_hall/context_engine/src/runtime/attachment_access.mjs';
import {sha256Canonical} from '../../../../../guild_hall/shared/project_history_envelope.mjs';
import {validateLinearCollectRunReceipt,runReceiptObjectKinds} from '../../../../../guild_hall/linear_history/linear_collect_receipt.mjs';
import {validateBuzzCollectRunReceipt} from '../../../../../guild_hall/buzz_history/buzz_collect_receipt.mjs';

export const CUSTODY_LIMITS=Object.freeze({files:1024,bytes:32*1024*1024,fileBytes:8*1024*1024,directoryEntries:512,sampleObjectsPerKind:16,sampleVersions:2});
const safe=/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u,sha=/^sha256:[a-f0-9]{64}$/u;
const fail=code=>{throw Object.assign(new Error(code),{code});};
export function verifyCustodyObject(record,{lane,kind,id,digest}){
  if(record?.schema_version!==`soulforge.${lane}_collect.custody_object.v1`||record.kind!==kind||record.object_id!==id||record.content_sha256!==digest||!sha.test(digest??''))return 'identity_mismatch';
  if(sha256Canonical(record.object)!==digest)return 'hash_mismatch';
  return null;
}
async function names(root,relative,limit){
  const target=path.join(root,relative);
  for(let at=target;;at=path.dirname(at)){
    const st=await lstat(at);if(st.isSymbolicLink()||!st.isDirectory()||await realpath(at)!==at)fail('path_refused');
    if(at===root)break;if(path.dirname(at)===at)fail('path_refused');
  }
  const rows=[];let limited=false;
  for await(const entry of await opendir(target)){if(rows.length>=limit){limited=true;break;}if(entry.isSymbolicLink())fail('path_refused');rows.push({name:entry.name,directory:entry.isDirectory(),file:entry.isFile()});}
  return {rows:rows.sort((a,b)=>a.name.localeCompare(b.name)),limited};
}
export async function inspectCustody(root,lane,{now=Date.now,limits=CUSTODY_LIMITS}={}){
  root=path.resolve(root);
  const result={lane,state:'unavailable',observed_at:null,collection_at:null,checked:0,failed:0,unreadable:0,expected:null,scope:lane==='linear'?'current_index':'bounded_sample',complete:false,codes:[]};
  let used=0,readCount=0;
  const read=async relative=>{if(readCount>=limits.files||used>=limits.bytes)fail('read_limit');
    const bytes=await readBoundedFile(path.join(root,relative),root,Math.min(limits.fileBytes,limits.bytes-used));used+=bytes.length;readCount++;return bytes;};
  const codeOf=e=>e.code==='read_limit'||e.code==='attachment_too_large'?'read_limit':e.code==='ENOENT'||e.code==='attachment_missing'?'file_missing':'read_refused';
  try{
    if(!['linear','buzz'].includes(lane))fail('lane_refused');
    const stateRef=`${lane}_history/state/state/${lane}-collect.json`,anchor=await read(stateRef),state=JSON.parse(anchor);
    if(state.schema_version!==`soulforge.${lane}_collect.state.v1`||!safe.test(state.last_run_id??''))fail('state_invalid');
    const receipt=JSON.parse(await read(`${lane}_history/state/receipts/${state.last_run_id}.json`));
    (lane==='linear'?validateLinearCollectRunReceipt:validateBuzzCollectRunReceipt)(receipt);
    if(receipt.run_id!==state.last_run_id||receipt.lane_id!==state.lane_id||receipt.generation_seq!==state.cursor?.generation_seq||receipt.writer_epoch!==state.writer_epoch||receipt.writer_authority_id!==state.writer_authority_id||receipt.status!=='ok')fail('receipt_mismatch');
    const owner=lane==='linear'?receipt.workspace_url_key:receipt.relay_key;
    if(!/^[a-z0-9][a-z0-9-]{0,63}$/u.test(owner))fail('scope_invalid');
    result.collection_at=receipt.completed_at;
    const targets=[];
    if(lane==='linear'){
      if(!state.object_index||typeof state.object_index!=='object'||Array.isArray(state.object_index))fail('index_invalid');
      const entries=Object.entries(state.object_index);result.expected=entries.length;
      const kinds=runReceiptObjectKinds(receipt.schema_version);
      for(const [key,value] of entries.slice(0,limits.files-3)){
        const [kind,id,...extra]=key.split(':');if(extra.length||!kinds.includes(kind)||!safe.test(id??'')||!sha.test(value?.content_sha256??''))fail('index_invalid');
        targets.push({kind,id,digest:value.content_sha256,relative:`ingress/linear/${owner}/${kind}/${id}/${value.content_sha256.slice(7)}.json`});
      }
    }else{
      // Buzz has no persisted object index. Read bounded, explicit samples from
      // each custody kind; never describe a sample as a full-store validation.
      for(const kind of ['events','tombstones','audit','snapshots']){
        const prefix=`ingress/buzz/${owner}/${kind}`,objects=await names(root,prefix,limits.directoryEntries);
        for(const item of objects.rows.filter(r=>r.directory&&safe.test(r.name)).slice(0,limits.sampleObjectsPerKind)){
          const versions=await names(root,`${prefix}/${item.name}`,limits.directoryEntries);
          for(const file of versions.rows.filter(r=>r.file&&/^[a-f0-9]{64}\.json$/u.test(r.name)).slice(0,limits.sampleVersions))targets.push({kind,id:item.name,digest:`sha256:${file.name.slice(0,64)}`,relative:`${prefix}/${item.name}/${file.name}`});
        }
      }
    }
    for(const target of targets){
      try{const record=JSON.parse(await read(target.relative)),problem=verifyCustodyObject(record,{lane,...target});if(problem){result.failed++;result.codes.push(problem);}else result.checked++;}
      catch(error){const code=codeOf(error);result.codes.push(code);if(code==='file_missing')result.failed++;else result.unreadable++;if(code==='read_limit')break;}
    }
    // Writer activity invalidates whole-scope claims instead of mixing indexes.
    const after=await read(stateRef);
    if(!after.equals(anchor))fail('changed_during_read');
    result.complete=lane==='linear'&&result.checked>0&&result.checked===result.expected&&result.failed===0&&result.unreadable===0;
    result.state=result.failed?'failed':!result.checked?'unavailable':result.complete?'passed':result.unreadable?'partial':'sampled';
  }catch(error){result.codes.push(['changed_during_read','state_invalid','index_invalid','receipt_mismatch','scope_invalid'].includes(error.code)?error.code:codeOf(error));result.state='unavailable';result.complete=false;}
  result.observed_at=new Date(now()).toISOString();result.codes=[...new Set(result.codes)];return result;
}

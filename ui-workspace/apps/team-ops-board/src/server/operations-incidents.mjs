import {inspectCustody} from './custody-checks.mjs';
import {readSourceConnections} from './source-connections.mjs';
import path from 'node:path';
import {open,lstat,realpath} from 'node:fs/promises';
import {readRootTable,physicalRootFor} from '../../../../../guild_hall/path_registry/src/root_table.mjs';
import {readBoundedFile} from '../../../../../guild_hall/context_engine/src/runtime/attachment_access.mjs';
const number=v=>Number.isSafeInteger(v)&&v>=0?v:null;
const stamp=v=>typeof v==='string'&&Number.isFinite(Date.parse(v))?v:null;
export function projectForwarderCycle(cycle,failures,now=Date.now()){
  const at=stamp(cycle?.observed_at),age=now-Date.parse(at??'');
  if(cycle?.action!=='cycle'||!at||age<0||age>15*60000||!Array.isArray(failures))return null;
  const active=number(cycle.held_count),tracked=number(cycle.tracked_failure_count),failed=number(cycle.failed_count),deferred=number(cycle.deferred_count);
  const validFailures=failures.every(r=>['error_proto','error_timeout','error_size','error_import','error_processing'].includes(r.failure_class)&&number(r.failure_count)>0&&stamp(r.last_attempt_at)&&Date.parse(r.last_attempt_at)<=Date.parse(at));
  const historyOnly=cycle.collector_status==='ok'&&active===0&&failed===0&&deferred===0&&tracked>0&&tracked===failures.length&&validFailures;
  return {observed_at:at,history_only:historyOnly,collector_status:cycle.collector_status==='ok'?'ok':'unknown',active_held:active,tracked,failed,deferred,
    last_attempt_at:failures.map(r=>stamp(r.last_attempt_at)).filter(Boolean).sort().at(-1)??null,
    reasons:[...new Set(failures.map(r=>r.failure_class).filter(r=>['error_proto','error_timeout','error_size','error_import','error_processing'].includes(r)))]};
}
async function tailCycle(file){
  const before=await lstat(file,{bigint:true});if(!before.isFile()||before.isSymbolicLink()||before.nlink!==1n||await realpath(file)!==file)throw Error('unsafe events');
  const handle=await open(file,'r');try{const opened=await handle.stat({bigint:true});if(opened.ino!==before.ino||opened.dev!==before.dev)throw Error('events changed');
    const length=Math.min(Number(before.size),65536),bytes=Buffer.alloc(length);const read=await handle.read(bytes,0,length,Number(before.size)-length);if(read.bytesRead!==length)throw Error('short events');
    const after=await lstat(file,{bigint:true});if(after.ino!==before.ino||after.dev!==before.dev||after.size!==before.size||after.mtimeNs!==before.mtimeNs||await realpath(file)!==file)throw Error('events changed');
    const lines=bytes.toString('utf8').split(/\r?\n/u);if(Number(before.size)>length)lines.shift();
    for(const line of lines.reverse()){try{const row=JSON.parse(line);if(row.action==='cycle')return row;}catch{}}
    return null;
  }finally{await handle.close();}
}
export function createOperationsIncidentReader(options={}){
  let cache=null,pending=null;
  async function collect(table){
    const root=physicalRootFor(table,'data_root'),answer={state:'ready',observed_at:new Date().toISOString(),linear:null,mail:null};
    try{const h=JSON.parse(await readBoundedFile(path.join(root,'linear_history/state/health/linear_collect.json'),root,1048576));
      if(['soulforge.linear_collect.health.v1','soulforge.linear_collect.health.v2'].includes(h.schema_version)&&['ok','error','degraded'].includes(h.status)&&Array.isArray(h.error_codes)&&h.error_codes.every(c=>typeof c==='string'&&/^[a-z_]{1,80}$/u.test(c)))answer.linear={status:h.status,observed_at:stamp(h.completed_at),last_success_at:stamp(h.last_success_at),codes:h.error_codes};
    }catch{}
    try{const folder=path.join(root,'state/mail/hiworks_gmail_forwarder');
      // This guarded state read admits the exact parent chain used for the tail.
      const state=JSON.parse(await readBoundedFile(path.join(folder,'state.json'),root,1048576));
      const cycle=await tailCycle(path.join(folder,'events.jsonl'));
      if([2,3].includes(state.schema_version)&&cycle&&Date.parse(cycle.observed_at)>=Date.parse(state.updated_at)-5000)answer.mail=projectForwarderCycle(cycle,Object.values(state.uidl_failures??{}));
    }catch{}
    [answer.custody,answer.connections]=await Promise.all([Promise.all(['linear','buzz'].map(lane=>inspectCustody(root,lane))),readSourceConnections(root)]);
    answer.state=answer.linear&&answer.mail?'ready':answer.linear||answer.mail?'partial':'unavailable';return answer;
  }
  return {async read(){const table=readRootTable(options);if(cache?.digest===table.table_sha256&&Date.now()-cache.at<60000)return cache.value;if(pending)return pending;
    pending=collect(table);try{const value=await pending;readRootTable(options);cache={digest:table.table_sha256,at:Date.now(),value};return value;}finally{pending=null;}
  }};
}

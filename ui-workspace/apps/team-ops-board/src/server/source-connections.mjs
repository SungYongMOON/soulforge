import tls from 'node:tls';
import path from 'node:path';
import {readBoundedFile} from '../../../../../guild_hall/context_engine/src/runtime/attachment_access.mjs';
import {validateLinearCollectRunReceipt} from '../../../../../guild_hall/linear_history/linear_collect_receipt.mjs';
import {validateBuzzCollectRunReceipt} from '../../../../../guild_hall/buzz_history/buzz_collect_receipt.mjs';
const HOSTS=Object.freeze({linear:'api.linear.app',slack:'slack.com',gmail:'gmail.googleapis.com'});
const fresh=(at,now)=>Number.isFinite(Date.parse(at))&&now-Date.parse(at)>=0&&now-Date.parse(at)<=1800000;
export function authenticatedRead(lane,health,receipt,now=Date.now()){
  try{
    (lane==='linear'?validateLinearCollectRunReceipt:validateBuzzCollectRunReceipt)(receipt);
    if(health?.schema_version!==`soulforge.${lane}_collect.health.v1`||health.status!=='ok'||health.last_run_id!==receipt.run_id||receipt.status!=='ok'||receipt.mode!=='apply'||!fresh(receipt.completed_at,now)||!fresh(health.completed_at,now))return null;
    const calls=receipt.read_calls?.by_operation;
    if(lane==='linear'&&(!receipt.network_used||!(calls?.['linear.read.viewer_organization']>0)))return null;
    if(lane==='buzz'&&(!(calls?.['buzz.read.liveness']>0)||!(calls?.['buzz.read.export']>0)))return null;
    return {observed_at:receipt.completed_at,basis:'authenticated_collection'};
  }catch{return null;}
}
export function probeTls(id){
  if(!Object.hasOwn(HOSTS,id))return Promise.resolve({state:'unavailable'});
  return new Promise(resolve=>{
    const started=Date.now();let ended=false;let socket;
    const done=state=>{if(ended)return;ended=true;clearTimeout(timer);socket?.destroy();resolve({state,elapsed_ms:Date.now()-started});};
    const timer=setTimeout(()=>done('failed'),3000);
    try{socket=tls.connect({host:HOSTS[id],port:443,servername:HOSTS[id],rejectUnauthorized:true},()=>done(socket.authorized?'responding':'failed'));socket.once('error',()=>done('failed'));}catch{done('failed');}
  });
}
export async function readSourceConnections(root,{tlsProbe=probeTls,fetchImpl=fetch,now=Date.now}={}){
  root=path.resolve(root);
  const json=async ref=>JSON.parse(await readBoundedFile(path.join(root,ref),root,1048576));
  const auth=async lane=>{try{const health=await json(`${lane}_history/state/health/${lane}_collect.json`);if(!/^[A-Za-z0-9][A-Za-z0-9._-]{0,120}$/u.test(health.last_run_id??''))return null;return authenticatedRead(lane,health,await json(`${lane}_history/state/receipts/${health.last_run_id}.json`),now());}catch{return null;}};
  const rows=await Promise.all(Object.keys(HOSTS).map(async id=>{
    const [transport,collection]=await Promise.all([tlsProbe(id),id==='linear'?auth('linear'):null]);
    return {id,state:transport.state,observed_at:new Date(now()).toISOString(),elapsed_ms:transport.elapsed_ms??null,basis:'tls',collection};
  }));
  let buzz={id:'buzz',state:'unavailable',basis:'http_liveness',observed_at:new Date(now()).toISOString(),collection:await auth('buzz')};
  let attempted=false;
  try{
    const binding=await json('config/buzz_history/buzz_collect.binding.json');
    const url=binding.relay?.liveness_url;
    if(binding.schema_version!=='soulforge.buzz_collect.binding.v1'||!/^http:\/\/127\.0\.0\.1:[0-9]{1,5}\/_liveness$/u.test(url??''))throw Error('unavailable');
    attempted=true;
    const at=Date.now(),response=await fetchImpl(url,{method:'GET',redirect:'error',credentials:'omit',signal:AbortSignal.timeout(3000)});
    await response.body?.cancel();buzz={...buzz,state:response.ok?'responding':'failed',elapsed_ms:Date.now()-at,observed_at:new Date(now()).toISOString()};
  }catch{buzz={...buzz,state:attempted?'failed':'unavailable'};}
  return [...rows,buzz];
}

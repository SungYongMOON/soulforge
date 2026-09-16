import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {defaultSpawnSpec} from './live-thread-adapter.mjs';
import {isDirectLoopbackRequest} from './loopback-request-guard.mjs';

export function projectCodexQuota(result,observedAt=new Date().toISOString()){
  const bucket=result?.rateLimitsByLimitId?result.rateLimitsByLimitId.codex:result?.rateLimits?.limitId&&result.rateLimits.limitId!=='codex'?null:result?.rateLimits;
  const window=value=>value&&typeof value.usedPercent==='number'&&value.usedPercent>=0&&value.usedPercent<=100&&Number.isSafeInteger(value.windowDurationMins)&&value.windowDurationMins>0&&Number.isSafeInteger(value.resetsAt)&&value.resetsAt>0
    ?{used_percent:value.usedPercent,window_minutes:value.windowDurationMins,resets_at_epoch_s:value.resetsAt}:null;
  const primary=window(bucket?.primary),secondary=window(bucket?.secondary);
  if(!primary&&!secondary)return {state:'unavailable',reason:'quota_window_unavailable',observed_at:observedAt,codex:null};
  return {state:'ready',source_kind:'codex_app_server_rate_limits',observed_at:observedAt,codex:{primary,secondary,observed_at:observedAt}};
}

// Reuse the Board's installed-CLI resolution. One bounded request, no thread,
// turn, login, reset redemption or persistent listener is created.
export function readCodexQuota({spawnImpl=spawn,spawnSpec=defaultSpawnSpec(),timeoutMs=12000,now=Date.now}={}){
  return new Promise(resolve=>{
    let child,reader,timer,done=false,bytes=0;
    const finish=value=>{if(done)return;done=true;clearTimeout(timer);reader?.close();try{child?.stdin.end();child?.kill();}catch{}resolve(value);};
    const fail=reason=>finish({state:'unavailable',reason,observed_at:new Date(now()).toISOString(),codex:null});
    try{child=spawnImpl(spawnSpec.command,spawnSpec.args,{windowsHide:true,shell:false,stdio:['pipe','pipe','pipe']});}catch{fail('quota_cli_unavailable');return;}
    const send=message=>{try{child.stdin.write(JSON.stringify(message)+'\n');}catch{fail('quota_transport_failed');}};
    timer=setTimeout(()=>fail('quota_read_timeout'),timeoutMs);
    const budget=chunk=>{bytes+=chunk.length;if(bytes>1024*1024)fail('quota_response_limit');};
    child.stdout.on('data',budget);child.stderr.on('data',budget);child.on('error',()=>fail('quota_cli_unavailable'));child.stdin.on('error',()=>fail('quota_transport_failed'));child.on('exit',()=>{if(!done)fail('quota_cli_closed');});
    reader=createInterface({input:child.stdout,crlfDelay:Infinity});
    reader.on('line',line=>{if(done)return;let message;try{message=JSON.parse(line);}catch{return;}
      if(message.id===1){if(message.error){fail('quota_initialize_failed');return;}send({method:'initialized',params:{}});send({id:2,method:'account/rateLimits/read',params:{}});}
      if(message.id===2){if(message.error){fail('quota_account_read_failed');return;}finish(projectCodexQuota(message.result,new Date(now()).toISOString()));}
    });
    send({id:1,method:'initialize',params:{clientInfo:{name:'soulforge-quota-reader',version:'1'}}});
  });
}
export function createCodexQuotaPlugin({read=readCodexQuota,now=Date.now}={}){
  let cache=null,pending=null;
  async function get(){if(cache&&now()-cache.at<60000)return {...cache.value,cached:true};if(pending)return pending;
    const operation=Promise.resolve().then(()=>read()).then(value=>{cache={at:now(),value};return value;});pending=operation;try{return await operation;}finally{if(pending===operation)pending=null;}}
  const configure=server=>{server.middlewares.use((req,res,next)=>{
    const url=new URL(req.url||'/','http://127.0.0.1');if(url.pathname!=='/codex-live-limits.json')return next();
    if(req.method!=='GET'){res.statusCode=405;res.end();return;}
    let origin=true;try{if(req.headers.origin)origin=new URL(req.headers.origin).host===req.headers.host;}catch{origin=false;}
    if(!isDirectLoopbackRequest(req)||!origin||req.headers['sec-fetch-site']==='cross-site'||!/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(req.headers.host??'')){res.statusCode=403;res.end();return;}
    if(url.search){res.statusCode=400;res.end();return;}
    res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');
    void get().then(v=>res.end(JSON.stringify(v)),()=>{res.statusCode=503;res.end('{"state":"unavailable","reason":"quota_read_failed"}');});
  });};return {name:'codex-quota-read-only',configureServer:configure,configurePreviewServer:configure};
}

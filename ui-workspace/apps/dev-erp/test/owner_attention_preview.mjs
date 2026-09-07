// Synthetic visual QA only. No real profile, credential, project or message.
// Isolated ERP DB + actual inbox HTTP controller; expires after 20 minutes.
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createOwnerAttentionHttpController } from '../src/owner_attention_http.mjs';
import { makeAttentionFixture } from './owner_attention_fixture.mjs';

let base='', mode='ok', authenticated=false, count=0;
const f=makeAttentionFixture(null,{persistent:true,serviceOptions:{resolveBuzzLink:source=>source.item_id
  ? {...source,url:`${base}/synthetic/buzz`,active:true,expires_at:'2030-01-01T00:00:00Z'} : null}});
const original=f.publish();
f.publish({client_session_ref:`oa1:review_scope:1:${Math.floor((f.now()-60000)/1000)}`,
  summary:'이번 검토의 범위를 설계 변경 부분으로 한정해도 될까요?',
  next_actions:['변경 부분만 검토할지, 전체 문서까지 검토할지 정해 주세요.'],
  stop_conditions:['검토 범위 확정을 기다리는 후속 문서 검토']});
let controller;
const shell=body=>`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>합성 검증 도우미</title><body style="font:18px system-ui;max-width:800px;margin:40px auto;padding:24px">${body}</body></html>`;
const server=createServer(async(req,res)=>{
  const url=new URL(req.url,base);
  if(req.method==='GET'&&url.pathname==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(shell('<h1>합성 응답 대기함 검증</h1><form method="POST" action="/synthetic/login"><button>합성 오너로 로그인</button></form>'));return;}
  if(req.method==='POST'&&url.pathname==='/synthetic/login'){authenticated=true;res.writeHead(303,{'Set-Cookie':'synthetic_attention=owner; HttpOnly; SameSite=Strict; Path=/','Location':'/owner-attention.html'});res.end();return;}
  if(req.method==='GET'&&url.pathname==='/synthetic/buzz'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(shell('<h1>합성 Buzz 대화</h1><p>이 페이지는 실제 Buzz가 아닙니다. 합성 오너의 원 요청 응답 기록을 검증합니다.</p><form method="POST" action="/synthetic/respond"><button>합성 제목 A로 답변 기록</button></form><a href="/owner-attention.html">응답 대기함</a>'));return;}
  if(req.method==='POST'&&url.pathname==='/synthetic/respond'){
    if(!authenticated||!req.headers.cookie?.includes('synthetic_attention=owner')){res.writeHead(401);res.end();return;}
    f.publish({request_kind:'owner_attention/response',summary:'합성 제목 A로 진행해 주세요.',outputs:[`owner-request:${original.work_session_id}`]},f.owner);
    res.writeHead(303,{Location:'/owner-attention.html'});res.end();return;
  }
  if(url.pathname==='/api/owner-attention'&&mode==='failure'){res.writeHead(503,{'Content-Type':'application/json'});res.end('{"status":"unavailable"}');return;}
  if(url.pathname==='/api/owner-attention'&&mode==='invalid'){res.writeHead(200,{'Content-Type':'application/json'});res.end('{"status":"available","items":[]}');return;}
  try{if(await controller(req,res,url))return;}catch{res.writeHead(500);res.end();return;}
  res.writeHead(404);res.end();
});
server.listen(0,'127.0.0.1');await once(server,'listening');base=`http://127.0.0.1:${server.address().port}`;
if([4300,4192].includes(server.address().port))throw new Error('reserved_operations_port');
controller=createOwnerAttentionHttpController({service:f.service,allowedOrigin:base,ownerAccountId:f.owner.id,
  syntheticPreview:true,
  currentAccount:req=>authenticated&&req.headers.cookie?.includes('synthetic_attention=owner')?f.owner:null,
  sessionKey:req=>req.headers.cookie?.includes('synthetic_attention=owner')?'synthetic-only':null,canAccessProject:()=>true});
let stopped=false;
const close=()=>{if(stopped)return;stopped=true;clearTimeout(ttl);server.close(()=>{f.close();process.exit(0);});server.closeAllConnections();};
const ttl=setTimeout(close,20*60000);
process.on('SIGINT',close);process.on('SIGTERM',close);
process.stdin.setEncoding('utf8');process.stdin.on('data',chunk=>{
  for(const line of chunk.trim().split(/\r?\n/u)){
    if(['ok','failure','invalid'].includes(line))mode=line;
    else if(line==='expire')f.clock.value+=31*60000;
    else if(line==='revision')f.publish({client_session_ref:`oa1:review_document:${++count+1}:none`,summary:'새 판본: 최종 제목안을 다시 확인해 주세요.'});
    else if(line==='stop')close();
    console.log(JSON.stringify({synthetic:true,mode,requests:f.source.read(f.owner.id).map(r=>({source_state:r.source_state,revision:r.revision})),counts:f.service.snapshot(f.access).notification.counts}));
  }
});
console.log(JSON.stringify({synthetic:true,url:base,root:f.root,pid:process.pid,expires_in_minutes:20}));

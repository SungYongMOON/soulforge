import path from 'node:path';
import { createHash } from 'node:crypto';
import { readRootTable, physicalRootFor } from '../../../../../guild_hall/path_registry/src/root_table.mjs';
import { readBoundedFile } from '../../../../../guild_hall/context_engine/src/runtime/attachment_access.mjs';
import { createAliasedStoreIo } from '../../../../../guild_hall/context_engine/src/adapters/aliased_store_io.mjs';
import { askEstateGraph } from '../../../../../guild_hall/context_engine/harness/estate_graph_query.mjs';
import { readToolsConfig, deriveAttachment } from '../../../../../guild_hall/context_engine/src/runtime/attachment_derivation.mjs';
import { chargeInvestigation } from '../../../../../guild_hall/context_engine/src/runtime/investigation_budget.mjs';
import { createOperationsDirectoryReader } from './operations-directory-adapter.mjs';
import { isDirectLoopbackRequest } from './loopback-request-guard.mjs';
import {registrationTimeline} from '../core/operations-dashboard-view.mjs';
import {createSourceObservationsReader} from './source-observations.mjs';
import {plaudCollectionObservation} from '../core/plaud-collection-view.mjs';
import {createOperationsIncidentReader} from './operations-incidents.mjs';

const PROJECT = /^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+$/u;
const PROTECTED = /(?:^\.|secret|credential|password|token|cookie|session|auth|^config|^binding|^settings|\.pem$|\.key$)/iu;
export const safePreviewRelative = value => typeof value === 'string' && value.length <= 2048
  && value.split('/').length <= 24 && value.split('/').every(s => s && s.length <= 255 && !/[\\:\x00-\x1f\x7f]/u.test(s) && !/[. ]$/u.test(s) && !PROTECTED.test(s));
const TEXT = new Set(['.txt','.md','.csv','.json','.jsonl','.log','.ts','.tsx','.js','.mjs','.py','.css','.html','.xml','.yaml','.yml']);
const OFFICE = new Set(['.pdf','.pptx','.xlsx']);
const sha = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
export function previewExtract(extract) {
  if(extract?.status!=='ok') return null;
  const lines=[];
  if(typeof extract.text==='string')lines.push(extract.text);
  for(const p of extract.pages??[])lines.push(`페이지 ${p.page}\n${p.text??''}`);
  for(const s of extract.slides??[])lines.push(`슬라이드 ${s.slide}\n${(s.shapes??[]).flatMap(shape=>[...(shape.runs??[]),...(shape.table??[]).map(row=>row.join(' | '))]).join('\n')}`);
  for(const s of extract.sheets??[])lines.push(`시트 ${s.sheet}${s.truncated?' · 일부 셀':''}\n${(s.cells??[]).map(c=>`${c.ref}: ${c.value??''}`).join('\n')}`);
  return lines.join('\n\n').slice(0,256*1024);
}

export function createOperationsSpacesReader(options = {}) {
  const directory = createOperationsDirectoryReader(options);
  const projects = (options.projects ?? []).filter(p => PROJECT.test(p));
  let recentCache = null;
  let deriving=false;
  const spaces = project => [
    {id:'plaud',label:'PLAUD · 녹음 자료',relative:'ingress/plaud/library',note:'녹음 라이브러리 · 원본과 처리 자료'},
    {id:'slack',label:'Slack · 채널 자료',relative:'ingress/slack/channels',note:'채널별 원본·첨부·수집 기록'},
    {id:'docs',label:'DOC · 팀 문서',relative:'ingress/team_files',note:'도착한 파일과 수락된 파일'},
    {id:'mail',label:'메일 · 보관 자료',relative:'ingress/mailbox',note:'계정별 원장과 첨부'},
    {id:'projects',label:'과제 · 데이터',relative:'20_PROJECTS',note:'과제별 저장 공간'},
    ...(projects.includes(project) ? [
      {id:'rag',label:`${project} · 문서 검색`,relative:`20_PROJECTS/${project}/20_문서검색`,note:'준비·청크·임베딩 판본'},
      {id:'memory',label:`${project} · 기억`,relative:`20_PROJECTS/${project}/40_기억관리`,note:'기억 자료 · 존재만으로 활성 기억을 뜻하지 않음'},
      {id:'context',label:`${project} · 맥락`,relative:`20_PROJECTS/${project}/50_업무맥락`,note:'업무별 맥락 꾸러미와 선택 근거'},
    ] : []),
  ].map(s => ({...s,root:'data_root'}));
  async function read({space='',project=projects[0]??'',relative='',file=false}={}) {
    let table;
    try { table=readRootTable(options); } catch { return {state:'unavailable',reason:'허용 경로 표 검증 실패',spaces:[],projects}; }
    const catalog=spaces(project);
    if(!space) return {state:'ready',spaces:catalog,projects};
    const selected=catalog.find(s=>s.id===space);
    if(!selected || relative && !safePreviewRelative(relative)) return {state:'denied',reason:'허용된 데이터 공간 밖입니다.'};
    const location=[selected.relative,relative].filter(Boolean).join('/');
    if(!file) return {...await directory.read({root:selected.root,relative:location}),space,relative};
    if(!relative) return {state:'denied',reason:'파일을 선택하세요.'};
    const extension=path.extname(relative).toLowerCase();
    const root=physicalRootFor(table,selected.root),target=path.join(root,...location.split('/'));
    if(!TEXT.has(extension) && !OFFICE.has(extension) && !['.png','.jpg','.jpeg','.webp'].includes(extension)) return {state:'unsupported',reason:'이 형식은 아직 미리보기를 지원하지 않습니다. 원본은 변경하지 않았습니다.'};
    try {
      const bytes=await readBoundedFile(target,root,TEXT.has(extension)?512*1024:8*1024*1024);
      const base={state:'ready',name:path.basename(relative),size:bytes.length,sha256:sha(bytes),read_at:new Date().toISOString()};
      if(OFFICE.has(extension)) {
        if(deriving)return {state:'hold',reason:'다른 문서 미리보기를 준비하고 있습니다. 잠시 후 다시 선택하세요.'};
        deriving=true;
        try {
          const io=createAliasedStoreIo(table),config=readToolsConfig(io.read('control_root/context-read/tools.v0.json',1024*1024));
          const derived=await deriveAttachment({tools:config,bytes,sha256:base.sha256,name:base.name,render:false});
          const text=previewExtract(derived.extract);
          if(text===null)return {state:'unavailable',reason:'기존 문서 추출기가 이 파일을 읽지 못했습니다.'};
          return {...base,kind:'text',text,note:'본문·표 텍스트 미리보기 · 서식·이미지·전체 페이지를 재현하지 않음 · 기존 추출 한도 및 256KB 표시 제한'};
        } finally {deriving=false;}
      }
      if(TEXT.has(extension)) {
        if(bytes.includes(0)) return {state:'unsupported',reason:'텍스트로 읽을 수 없는 파일입니다.'};
        return {...base,kind:'text',text:bytes.toString('utf8')};
      }
      const png=bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
      const jpeg=bytes[0]===255 && bytes[1]===216 && bytes[2]===255;
      const webp=bytes.toString('ascii',0,4)==='RIFF' && bytes.toString('ascii',8,12)==='WEBP';
      const mime=extension==='.png'&&png?'image/png':['.jpg','.jpeg'].includes(extension)&&jpeg?'image/jpeg':extension==='.webp'&&webp?'image/webp':null;
      if(!mime) return {state:'denied',reason:'파일 형식 검증 실패'};
      return {...base,kind:'image',mime,base64:bytes.toString('base64')};
    } catch { return {state:'unavailable',reason:'파일 읽기 거부·변경 감지 또는 크기 제한 초과 (텍스트 512KB / 이미지·문서 8MB)'}; }
  }
  async function recent() {
    let table;
    try { table=readRootTable(options); } catch { return {state:'unavailable',rows:[],reason:'허용 경로 표 검증 실패'}; }
    if(recentCache && recentCache.digest===table.table_sha256 && Date.now()-recentCache.at<60000) return recentCache.value;
    try {
      const root=physicalRootFor(table,'data_root');
      const bytes=await readBoundedFile(path.join(root,'ingress/plaud/library/index/recordings.current.json'),root,8*1024*1024);
      const data=JSON.parse(bytes);
      if(data.schema_version!=='soulforge.voice_recording_library_index.v0'||!Array.isArray(data.recordings)) throw Error('shape');
      const timeline=registrationTimeline(data);
      const value={state:timeline.state==='ready'?'ready':'partial',rows:timeline.recent??[],timeline,observed_at:data.generated_at,scope:'PLAUD 라이브러리 등록 시각 · RAG 완료와 별도'};
      try {
        const health=JSON.parse(await readBoundedFile(path.join(root,'state/health/continuous_ingress.json'),root,1024*1024));
        if(/^[0-9TZ_A-Za-z-]{1,150}$/u.test(health.last_run_id??'')){
          const receipt=JSON.parse(await readBoundedFile(path.join(root,`state/receipts/continuous_ingress/${health.last_run_id}.json`),root,1024*1024));
          value.collection=plaudCollectionObservation(health,receipt);
        }
      }catch{value.collection=null;}
      recentCache={value,at:Date.now(),digest:table.table_sha256};return value;
    } catch { return {state:'unavailable',rows:[],reason:'PLAUD 등록 원장 읽기 실패'}; }
  }
  let querying=false;
  async function query(body) {
    if(querying)return {state:'hold',reason:'검색이 진행 중입니다.'};
    if(!projects.includes(body.project)||typeof body.question!=='string'||!body.question.trim()||body.question.length>2000||!/^ops-[a-f0-9-]{36}$/u.test(body.investigation??'')) return {state:'denied',reason:'검색 입력 또는 조사 ID가 유효하지 않습니다.'};
    querying=true;let budget;
    try {
      const table=readRootTable(options),io=createAliasedStoreIo(table);
      const toolsBytes=io.read('control_root/context-read/tools.v0.json',1024*1024),config=readToolsConfig(toolsBytes);
      budget=chargeInvestigation({receiptsRoot:config.receipts_root,cli:'query',args:{project:body.project,mode:'lexical',tools_config_sha256:sha(toolsBytes),root_table_sha256:table.table_sha256},devRun:body.investigation,env:{}});
      const result=await askEstateGraph({io,project:body.project,question:body.question,modes:['lexical'],topK:12,quote:160});
      budget.finish('completed');return {state:'ready',result,remaining:budget.remaining};
    } catch(error) { if(budget)budget.finish('failed');return {state:'unavailable',reason:typeof error.code==='string'&&/^[a-z_]+$/u.test(error.code)?error.code:'검색 근거를 읽지 못했습니다.'}; }
    finally {querying=false;}
  }
  return {read,recent,query};
}

export function createOperationsSpacesPlugin(options={}) {
  const reader=createOperationsSpacesReader(options);
  const sources=createSourceObservationsReader(options);
  const incidents=createOperationsIncidentReader(options);
  const configure=server=>{server.middlewares.use((req,res,next)=>{
    let url;try{url=new URL(req.url||'/','http://127.0.0.1');}catch{res.statusCode=400;res.end();return;}
    if(!['/operations-spaces.json','/operations-file.json','/operations-recent.json','/operations-sources.json','/operations-incidents.json','/operations-query.json'].includes(url.pathname))return next();
    const query=url.pathname==='/operations-query.json';
    if(req.method!==(query?'POST':'GET')){res.statusCode=405;res.end();return;}
    let origin=true;try{if(req.headers.origin)origin=new URL(req.headers.origin).host===req.headers.host;}catch{origin=false;}
    if(!isDirectLoopbackRequest(req)||!origin||req.headers['sec-fetch-site']==='cross-site'||!/^(127\.0\.0\.1|localhost)(:\d+)?$/u.test(req.headers.host||'')){res.statusCode=403;res.end();return;}
    res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
    const send=value=>res.end(JSON.stringify(value));
    if(query){
      if(req.headers['content-type']!=='application/json'){res.statusCode=415;send({state:'denied'});return;}
      void(async()=>{let text='';for await(const chunk of req){text+=chunk;if(Buffer.byteLength(text)>8192)throw Error('limit');}return reader.query(JSON.parse(text));})().then(send,()=>{res.statusCode=400;send({state:'denied'});});return;
    }
    if([...url.searchParams.keys()].some(k=>!['space','project','relative'].includes(k))){res.statusCode=400;send({state:'denied'});return;}
    const operation=url.pathname==='/operations-incidents.json'?incidents.read():url.pathname==='/operations-sources.json'?sources.read():url.pathname==='/operations-recent.json'?reader.recent():reader.read({...Object.fromEntries(url.searchParams),file:url.pathname==='/operations-file.json'});
    void operation.then(send,()=>{res.statusCode=503;send({state:'unavailable'});});
  });};
  return {name:'operations-spaces-read-only',configureServer:configure,configurePreviewServer:configure};
}

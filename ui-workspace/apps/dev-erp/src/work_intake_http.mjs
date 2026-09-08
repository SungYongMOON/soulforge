import { createHash } from 'node:crypto';

const BASE = '/api/workbench/work-intake', PAGE = '/workbench/work-intake';
const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const REF = /^[A-Za-z0-9][A-Za-z0-9._:@/_-]{0,127}$/u, SHA = /^[a-f0-9]{64}$/u;
const fail = (status, code) => { throw Object.assign(new Error(code), { httpStatus: status, httpCode: code }); };
export const workIntakeViewScript = String.raw`
const list=document.getElementById('items'), detail=document.getElementById('detail'), status=document.getElementById('status'), next=document.getElementById('next');
let after=0;
const labels={NEW:'새 업무 후보',FOLLOW_UP:'기존 업무의 후속 조치',EVIDENCE:'자료 보강 후보',NO_ACTION:'새 조치 없음',HOLD:'판단 보류',COMMITTED:'검토용 결과 준비',HELD:'보류',RUNNING:'분석 중',MODEL_UNKNOWN:'분석 종료 확인 필요'};
const reasons={NEW_REQUEST:'새 요청이 발견됐습니다.',EXISTING_TASK:'현재 업무와 연결된 후속 조치입니다.',SUPPORTING_EVIDENCE:'기존 업무를 뒷받침하는 자료입니다.',ALREADY_COMPLETED:'이미 완료된 업무와 관련된 내용입니다.',NO_NEW_REQUEST:'추가로 할 일이 확인되지 않았습니다.',INSUFFICIENT_EVIDENCE:'판단에 필요한 근거가 부족합니다.',ENGINEERING_EVIDENCE_UNKNOWN:'공학 기준과 비교할 현재 상태가 아직 확인되지 않았습니다.',INTAKE_DECISION_NOT_APPLIED:'중복·정정 검사를 통과하지 않아 후보를 적용하지 않았습니다.'};
function add(parent,tag,text){const node=document.createElement(tag);node.textContent=text;parent.append(node);return node;}
async function get(url){const r=await fetch(url,{credentials:'same-origin',cache:'no-store',redirect:'error'});if(!r.ok)throw new Error('현재 권한으로 조회할 수 없습니다.');return r.json();}
async function load(cursor=0){list.replaceChildren();detail.replaceChildren();next.disabled=true;try{
 const data=await get('/api/workbench/work-intake?limit=50&after='+cursor);after=data.next;next.disabled=after===null;
 status.textContent=data.project_ref+' · '+data.items.length+'개 실행 기록';
 for(const row of data.items){const item=add(list,'article','');add(item,'h2',labels[row.state]||'상태 확인 필요');add(item,'p','확인 시각: '+row.started_at);if(row.reason)add(item,'p','처리 보류 사유가 기록되어 있습니다.');
 if(row.result_ref){const b=add(item,'button','업무 후보·근거 보기');b.addEventListener('click',async()=>{detail.replaceChildren();try{
 const data=await get('/api/workbench/work-intake/result?'+new URLSearchParams({run_id:row.run_id,ref:row.result_ref,sha256:row.result_sha256}));
 add(detail,'p','후보는 검토 대상입니다. 공식 업무·사람 수락·완료가 아닙니다.');
 if(data.data_provenance==='synthetic')add(detail,'p','합성 자료로 기능을 확인한 결과입니다.');
 for(const candidate of data.candidates){const card=add(detail,'article','');add(card,'h2',labels[candidate.classification]||'판단 보류');
 for(const reason of candidate.reason_codes)add(card,'p',reasons[reason]||'근거 또는 현재 상태를 추가로 확인해야 합니다.');
 if(candidate.matched_task_ref)add(card,'p','관련 업무: '+candidate.matched_task_ref);
 if(candidate.engineering){const findings=candidate.engineering.findings||[];add(card,'p','공학 기준 비교: 확인된 누락 '+findings.filter(f=>f.gap_type==='gap_missing').length+'개 · 미확인 '+findings.filter(f=>f.gap_type==='gap_unknown').length+'개');}}
 const technical=add(detail,'details','');add(technical,'summary','참조·판본·검증 기록 보기');add(technical,'pre',JSON.stringify(data,null,2));
 }catch(e){add(detail,'p',e.message);}});}}
 }catch(e){status.textContent=e.message;}}
document.getElementById('refresh').addEventListener('click',()=>load());next.addEventListener('click',()=>load(after));load();`;
export function renderWorkIntakeView() { return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>과제 업무 발견</title></head><body><main><h1>과제 업무 발견</h1><p>신규·후속·자료 보강·무조치·보류 후보와 판단 근거를 확인합니다. 원문 및 공식 등록 기능은 포함하지 않습니다.</p><button id="refresh">새로고침</button><button id="next" disabled>이어보기</button><p id="status" role="status"></p><section id="items"></section><section id="detail"></section></main><script>${workIntakeViewScript}</script></body></html>`; }

export function createWorkIntakeHttpController({ service, allowedOrigin, currentAccount, sessionKey, canAccessProject }) {
  if (![currentAccount, sessionKey, canAccessProject].every(fn => typeof fn === 'function')) throw new Error('SERVER_AUTH_REQUIRED');
  const origin = new URL(allowedOrigin);
  if (origin.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(origin.hostname)
    || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) throw new Error('ORIGIN_REQUIRED');
  async function principal(req) {
    const account = await currentAccount(req), key = await sessionKey(req);
    if (!account?.id || !key) fail(401, 'AUTH_REQUIRED');
    return { accountId: account.id, digest: createHash('sha256').update(JSON.stringify([account.id, key])).digest('hex') };
  }
  return async (req, res, url) => {
    if (![PAGE, BASE, `${BASE}/result`].includes(url.pathname)) return false;
    let code = 200, payload, html = false;
    try {
      if (req.method !== 'GET') fail(405, 'GET_ONLY');
      if (!LOOPBACK.has(req.socket.remoteAddress) || req.headers.host !== origin.host
        || !(url.pathname === PAGE ? ['none', 'same-origin'] : ['same-origin']).includes(req.headers['sec-fetch-site'])
        || req.headers.origin !== undefined && req.headers.origin !== origin.origin) fail(403, 'ORIGIN_REQUIRED');
      if (!service) fail(503, 'INTAKE_UNAVAILABLE');
      if (req.url !== `${url.pathname}${url.search}`) fail(400, 'QUERY_INVALID');
      const p = await principal(req), projects = new Set();
      const access = { accountId: p.accountId, checkSession: async () => { try { return (await principal(req)).digest === p.digest; } catch { return false; } },
        canAccessProject: project => { projects.add(project); return canAccessProject(req, project); } };
      const keys = [...url.searchParams.keys()]; if (keys.length !== new Set(keys).size) fail(400, 'QUERY_INVALID');
      if (url.pathname === `${BASE}/result`) {
        const value = Object.fromEntries(url.searchParams);
        if (keys.length !== 3 || !keys.every(key => ['run_id', 'ref', 'sha256'].includes(key))
          || !REF.test(value.run_id) || !REF.test(value.ref) || !SHA.test(value.sha256)) fail(400, 'QUERY_INVALID');
        payload = await service.detail(value, access);
      } else {
        if (keys.some(key => !['limit', 'after'].includes(key)) || url.pathname === PAGE && keys.length) fail(400, 'QUERY_INVALID');
        const limit = url.searchParams.get('limit') ?? '50', after = url.searchParams.get('after') ?? '0';
        if (!/^[1-9][0-9]{0,2}$/u.test(limit) || Number(limit) > 100 || !/^(?:0|[1-9][0-9]{0,14})$/u.test(after)) fail(400, 'QUERY_INVALID');
        payload = await service.snapshot({ limit: Number(limit), after: Number(after) }, access);
        html = url.pathname === PAGE;
      }
      if (!REF.test(payload?.project_ref)) fail(503, 'INTAKE_UNAVAILABLE');
      projects.add(payload.project_ref);
      for (const project of projects) if (await canAccessProject(req, project) !== true) fail(403, 'PROJECT_FORBIDDEN');
      if (!await access.checkSession()) fail(401, 'AUTH_REQUIRED');
      if (html) payload = renderWorkIntakeView();
    } catch (error) {
      code = error.httpStatus ?? (error.workIntakeCode === 'INTAKE_VIEW_FORBIDDEN' ? 403 : error.workIntakeCode === 'INTAKE_RESULT_NOT_FOUND' ? 404 : 503);
      payload = { status: 'UNAVAILABLE', code: error.httpCode ?? 'INTAKE_UNAVAILABLE' }; html = false;
    }
    res.statusCode = code;
    res.setHeader('Content-Type', html ? 'text/html; charset=utf-8' : 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', html ? `default-src 'none'; connect-src 'self'; script-src 'sha256-${createHash('sha256').update(workIntakeViewScript).digest('base64')}'; base-uri 'none'; frame-ancestors 'none'` : "sandbox; default-src 'none'");
    res.end(html ? payload : JSON.stringify(payload)); return true;
  };
}

import { createOwnerAttentionLoader } from './owner_attention_load.mjs';
import { safeOwnerAttentionBuzzUrl } from './owner_attention_buzz_link.mjs';
const OPEN = new Set(['awaiting', 'response_unverified']);
let snapshot = null, filter = 'active', generation = 0, mutating = false;
const $ = s => document.querySelector(s);
const el = (tag, text, cls) => { const node = document.createElement(tag); if (text != null) node.textContent = text; if (cls) node.className = cls; return node; };
const date = value => value ? new Intl.DateTimeFormat('ko-KR', { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' }).format(new Date(value)) : '지정하지 않음';
function fact(dl, label, value) { dl.append(el('dt', label)); const dd = el('dd'); if (Array.isArray(value)) { const ul = el('ul'); for (const line of value) ul.append(el('li', line)); dd.append(ul); } else dd.textContent = value; dl.append(dd); }
function button(label, action) { const b = el('button', label); b.type = 'button'; b.addEventListener('click', action); return b; }
async function act(row, action, minutes, card) {
  if (mutating || !snapshot) return;
  const currentGeneration = ++generation; loader.invalidate(); mutating = true;
  for (const b of document.querySelectorAll('button')) b.disabled = true;
  card.querySelector('.error-inline')?.remove();
  try {
    const response = await fetch('/api/owner-attention/actions', { method:'POST', credentials:'same-origin',
      signal:AbortSignal.timeout(8000),
      headers:{'Content-Type':'application/json','X-CSRF-Token':snapshot.csrf_token},
      body:JSON.stringify({request_key:row.request_key,source_sha256:row.source_sha256,view_version:row.view_version,action,...(minutes ? {minutes} : {})}) });
    if (!response.ok) throw new Error(response.status === 409 ? '요청이 바뀌었습니다. 최신 목록을 다시 확인해 주세요.' : '변경 결과를 확인하지 못했습니다. 새로 고침으로 확인해 주세요.');
    if (currentGeneration === generation) { mutating = false; await refresh(); }
  } catch (error) {
    if (currentGeneration !== generation) return;
    // Never leave an enabled action backed by a possibly stale source/token.
    mutating = false; snapshot = null; unknown(['AbortError','TimeoutError'].includes(error.name) ? '변경 결과를 제시간에 확인하지 못했습니다. 새로 고침으로 확인해 주세요.' : error.message);
  } finally {
    if (currentGeneration === generation) for (const b of document.querySelectorAll('button')) b.disabled = false;
  }
}
function card(row) {
  const node = el('article', null, 'card');
  const top = el('div', null, 'card-top');
  top.append(el('span', `${row.sender_label} · ${row.project_id} · 요청 ${row.revision}판`, 'identity'));
  const status = row.source_state === 'responded' ? '오너 응답 확인' : row.source_state === 'withdrawn' ? '요청 철회'
    : row.source_state === 'superseded' ? '새 판본으로 교체' : row.source_state === 'response_unverified' ? '답변 기록 확인 대기'
      : row.snoozed ? `${date(row.snooze_until)} 다시 보기` : row.overdue ? '기한 지남' : row.seen_at ? '확인함 · 응답 필요' : '새 응답 요청';
  top.append(el('span', status, `badge${row.overdue ? ' warn' : ''}`)); node.append(top, el('h2', row.question));
  const dl = el('dl', null, 'facts'); fact(dl, '다음 행동', row.next_actions); fact(dl, '기다리는 일', row.blocked_work); fact(dl, '관련 업무', row.item_title); fact(dl, '응답 기한', date(row.due_at)); node.append(dl);
  const actions = el('div', null, 'actions');
  if (row.buzz_url) { const a = el('a', OPEN.has(row.source_state) ? 'Buzz에서 답변하기' : 'Buzz 대화 보기', 'button primary'); a.href = row.buzz_url; a.rel = 'noopener noreferrer'; if (row.buzz_url.startsWith('buzz:')) a.title = 'Buzz 앱에서 대화를 엽니다. 이 기기에 앱 연결이 필요합니다.'; actions.append(a); }
  else actions.append(el('span', '이 요청의 Buzz 대화 연결을 아직 확인하지 못했습니다.', 'route-missing'));
  if (OPEN.has(row.source_state)) {
    if (!row.seen_at) actions.append(button('확인했어요', () => act(row, 'seen', null, node)));
    const snooze = el('div', null, 'snooze');
    if (row.snoozed) snooze.append(button('지금 다시 보기', () => act(row, 'unsnooze', null, node)));
    else for (const [minutes,label] of [[30,'30분 뒤'],[120,'2시간 뒤'],[1440,'내일 이 시간']]) snooze.append(button(label, () => act(row, 'snooze', minutes, node)));
    actions.append(snooze);
  }
  node.append(actions);
  const detail = el('details'); detail.append(el('summary', '판단·검증과 근거 보기'));
  if (row.judgment) detail.append(el('p', `판단: ${row.judgment}`));
  if (row.verification) detail.append(el('p', `검증: ${row.verification}`));
  detail.append(el('p', `등록: ${date(row.created_at)}\n${[row.source_ref,...row.refs,...(row.closure_ref ? [row.closure_ref] : [])].join('\n')}`)); node.append(detail);
  return node;
}
function unknown(message = '현재 상태를 확인하지 못했습니다. 목록을 새로 고쳐 주세요.') {
  $('#connection').className = 'connection error'; $('#connection').textContent = message;
  for (const id of ['active-count','overdue-count','snoozed-count']) $(`#${id}`).textContent = '—';
  $('#notification').textContent = '알림 상태 미확인';
  const box = el('div', null, 'empty'); box.append(el('strong', '현재 요청 상태 미확인'), el('span', '이전 목록으로 판단하지 않도록 잠시 비웠습니다. '));
  const link = el('a', '로그인 확인'); link.href = '/'; box.append(link); $('#requests').replaceChildren(box); $('#requests').setAttribute('aria-busy','false');
}
function render() {
  if (!snapshot) return;
  const active = snapshot.items.filter(r => OPEN.has(r.source_state));
  $('#active-count').textContent = String(active.filter(r => !r.snoozed).length);
  $('#overdue-count').textContent = String(active.filter(r => r.overdue).length);
  $('#snoozed-count').textContent = String(active.filter(r => r.snoozed).length);
  $('#notification').textContent = snapshot.notification.capability === 'configured' ? '오너 알림 연결됨' : '오너 알림 연결 준비 중';
  const unknownDeliveries = snapshot.notification.counts.delivery_unknown || 0;
  if (unknownDeliveries) $('#notification').textContent += ` · 전달 확인 필요 ${unknownDeliveries}건`;
  const items = snapshot.items.filter(r => filter === 'closed' ? !OPEN.has(r.source_state) : OPEN.has(r.source_state) && (filter === 'snoozed' ? r.snoozed : !r.snoozed));
  const area = $('#requests'); area.replaceChildren(...items.map(card)); area.setAttribute('aria-busy','false');
  if (!items.length) { const empty = el('div', null, 'empty'); empty.append(el('strong', filter === 'active' ? '지금 응답할 요청이 없습니다' : '아직 이 목록에 기록이 없습니다'), el('span', filter === 'active' ? '명시적으로 등록된 요청을 기준으로 확인했습니다.' : '요청의 상태가 바뀌면 여기에 표시됩니다.')); area.append(empty); }
  $('#connection').className = 'connection'; $('#connection').textContent = `최근 확인 ${date(snapshot.observed_at)} · 읽음과 업무 완료는 별도로 관리합니다.`;
}
function valid(data) {
  const linkSafe = value => value === null || safeOwnerAttentionBuzzUrl(value) !== null;
  return data?.status === 'available' && /^[a-f0-9]{64}$/u.test(data.csrf_token || '') && Number.isFinite(Date.parse(data.observed_at))
    && Array.isArray(data.items) && data.items.every(row => typeof row.question === 'string' && typeof row.sender_label === 'string'
      && typeof row.item_title === 'string' && Array.isArray(row.next_actions) && Array.isArray(row.blocked_work) && Array.isArray(row.refs)
      && ['awaiting','response_unverified','responded','withdrawn','superseded'].includes(row.source_state)
      && linkSafe(row.buzz_url) && (row.due_at === null || Number.isFinite(Date.parse(row.due_at))) && Number.isFinite(Date.parse(row.created_at)))
    && data.notification && ['configured','unavailable'].includes(data.notification.capability) && typeof data.notification.counts === 'object';
}
const loader = createOwnerAttentionLoader({
  async read(signal) {
    const response = await fetch('/api/owner-attention', {credentials:'same-origin',signal,cache:'no-store'});
    if (!response.ok) throw new Error(response.status === 401 ? '로그인한 뒤 응답 대기함을 다시 열어 주세요.' : response.status === 403 ? '현재 오너 계정과 접근 권한을 확인해 주세요.' : '현재 요청 상태를 읽지 못했습니다. 새로 고침으로 다시 확인해 주세요.');
    return response.json();
  }, valid,
  loading() { $('#refresh').disabled = true; $('#requests').setAttribute('aria-busy','true'); $('#connection').className = 'connection'; $('#connection').textContent = '최신 요청 상태를 확인하고 있습니다.'; },
  available(data) { snapshot = data; render(); },
  unavailable(message) { snapshot = null; unknown(message); },
  settled() { $('#refresh').disabled = false; },
});
function refresh() { if (!mutating) return loader.refresh(); }
for (const b of document.querySelectorAll('[data-filter]')) b.addEventListener('click', () => { filter = b.dataset.filter; for (const other of document.querySelectorAll('[data-filter]')) other.setAttribute('aria-pressed', String(other === b)); render(); });
$('#refresh').addEventListener('click', refresh);
window.addEventListener('pagehide', () => { ++generation; loader.close(); clearInterval(timer); });
window.addEventListener('pageshow', event => { if (event.persisted) location.reload(); });
const timer = setInterval(() => { if (document.visibilityState === 'visible') refresh(); }, 60000);
refresh();

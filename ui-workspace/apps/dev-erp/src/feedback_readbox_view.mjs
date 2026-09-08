/** Static manager shell: all evidence arrives through the guarded read API. */
export const feedbackReadboxScript = String.raw`
const status = document.getElementById('status');
const list = document.getElementById('items');
const detail = document.getElementById('detail');
const next = document.getElementById('next');
let nextCursor = null;
let pageRequest = 0;
let detailRequest = 0;
let selectedButton = null;
const labels = {
  RUNNING: '실행 중', EXECUTION_UNKNOWN: '실행 상태 확인 안 됨', HELD_INTERNAL: '내부 처리 보류',
  CANDIDATE_REPORTED: '결과 후보 보고됨', HEALTHY: '정상', EXECUTION_OVERDUE: '실행 시간 초과',
  TICK_STALE: '상태 갱신 지연', NEVER_STARTED: '아직 실행되지 않음', SOURCE_UNAVAILABLE: '자료 확인 불가',
  ACCEPT: '검토 통과', REJECT: '검토 반려', HOLD: '검토 보류', NOT_ACCEPTED: '검토 통과 확인 안 됨',
  NOT_APPLICABLE: '해당 없음', UNKNOWN: '확인 안 됨', NOT_OBSERVED: '전달 확인 없음',
  PREPARED: '전달 준비됨', DELIVERY_UNKNOWN: '전달 여부 확인 안 됨', ACKNOWLEDGED: '전달 확인됨(ACK)',
};
const label = value => Object.hasOwn(labels, String(value).toUpperCase()) ? labels[String(value).toUpperCase()] : '확인 안 됨';
const show = (parent, tag, value) => {
  const element = document.createElement(tag);
  element.textContent = value;
  parent.append(element);
  return element;
};
function summary(parent, item) {
  show(parent, 'p', '관찰 시각: ' + item.observed_at);
  show(parent, 'p', '검토 결과: ' + label(item.review?.status));
  show(parent, 'p', '로컬 기록: ' + (item.local_recorded ? '저장됨' : '확인 안 됨')
    + ' · Buzz 전달: ' + label(item.buzz_delivery?.status ?? item.buzz_delivery));
  show(parent, 'p', '실제 사람 수락: 확인 안 됨 · 공식 완료: 확인하지 않음');
  if (item.reason) show(parent, 'p', item.reason === 'FEEDBACK_REVIEW_REQUIRED'
    ? '추가 검토가 필요합니다.' : '처리 사유가 기록되어 있습니다. 세부 정보에서 확인할 수 있습니다.');
}
async function read(path) {
  const response = await fetch(path, { credentials: 'same-origin', cache: 'no-store', redirect: 'error' });
  if (!response.ok) throw new Error(response.status === 401 ? '로그인이 필요합니다.' : response.status === 403 ? '현재 과제 접근 권한이 없습니다.' : '자료를 읽을 수 없습니다.');
  return response.json();
}
async function load(cursor = null) {
  const request = ++pageRequest;
  ++detailRequest;
  selectedButton = null;
  list.replaceChildren(); detail.replaceChildren();
  detail.hidden = true; detail.setAttribute('aria-busy', 'false');
  nextCursor = null;
  next.disabled = true;
  status.textContent = '불러오는 중…';
  try {
    const query = new URLSearchParams({ limit: '50' });
    if (cursor) query.set('cursor', cursor);
    const data = await read('/api/workbench/feedback-readbox?' + query);
    if (request !== pageRequest) return;
    nextCursor = data.next_cursor ?? null; next.disabled = !nextCursor;
    status.textContent = data.project_id + ' · 이 페이지 ' + data.items.length + '건' + (data.has_more ? ' · 이어보기 가능' : ' · 순회 완료');
    for (const item of data.items) {
      const row = show(list, 'article', '');
      show(row, 'h2', label(item.state));
      summary(row, item);
      const button = show(row, 'button', '상세 근거 보기');
      button.type = 'button';
      button.setAttribute('aria-controls', 'detail');
      button.setAttribute('aria-expanded', 'false');
      button.addEventListener('click', async () => {
        const request = ++detailRequest;
        selectedButton?.setAttribute('aria-expanded', 'false');
        selectedButton = button; button.setAttribute('aria-expanded', 'true');
        detail.replaceChildren();
        detail.hidden = false; detail.setAttribute('aria-busy', 'true');
        show(detail, 'h2', '상세 근거');
        show(detail, 'p', '불러오는 중…');
        detail.focus(); detail.scrollIntoView({ block: 'start' });
        try {
          const query = new URLSearchParams({ ref: item.ref, sha256: item.sha256 });
          if (item.locator) query.set('locator', item.locator);
          const evidence = await read('/api/workbench/feedback-readbox/evidence?' + query);
          if (request !== detailRequest) return;
          detail.replaceChildren();
          show(detail, 'h2', '상세 근거 · ' + label(evidence.state));
          summary(detail, evidence);
          show(detail, 'h3', '근거 확인');
          const pins = show(detail, 'dl', '');
          for (const [name, value] of [['기록 참조', evidence.ref], ['내용 확인 해시(SHA-256)', evidence.sha256],
            ['검토 참조', evidence.review?.ref ?? '확인 안 됨']]) {
            show(pins, 'dt', name); show(pins, 'dd', value);
          }
          const references = show(detail, 'ul', '');
          for (const pin of evidence.evidence_refs ?? []) show(references, 'li', typeof pin === 'string' ? pin : pin.ref);
          const technical = show(detail, 'details', '');
          show(technical, 'summary', '식별자와 세부 정보');
          show(technical, 'pre', JSON.stringify(evidence, null, 2));
        } catch (error) {
          if (request !== detailRequest) return;
          detail.replaceChildren(); show(detail, 'h2', '상세 근거'); show(detail, 'p', error.message);
        } finally {
          if (request === detailRequest) {
            detail.setAttribute('aria-busy', 'false');
            detail.scrollIntoView({ block: 'start' });
          }
        }
      });
    }
    if (!data.items.length) show(list, 'p', '현재 표시할 기록이 없습니다.');
  } catch (error) { if (request === pageRequest) status.textContent = error.message; }
}
document.getElementById('refresh').addEventListener('click', () => load());
next.addEventListener('click', () => load(nextCursor));
load();
`;

export function renderFeedbackReadboxView() {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>관리자 피드백 읽기</title></head><body>
<main><h1>관리자 피드백 읽기</h1><p>검토 통과, 로컬 기록, Buzz 전달 확인, 실제 사람 수락, 공식 완료는 각각 구분합니다. 실행·전달 상태를 확인할 수 없다는 사실만으로 책임자 판단이 필요한 것은 아닙니다.</p>
<button id="refresh" type="button">새로고침</button><button id="next" type="button" disabled>이어보기</button><p id="status" role="status" aria-live="polite"></p><section id="items" aria-label="피드백 기록"></section><section id="detail" aria-label="상세 근거" aria-live="polite" tabindex="-1" hidden></section></main>
<script>${feedbackReadboxScript}</script></body></html>`;
}

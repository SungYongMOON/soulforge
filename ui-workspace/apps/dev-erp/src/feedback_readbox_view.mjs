/** Static manager shell: all evidence arrives through the guarded read API. */
export const feedbackReadboxScript = String.raw`
const status = document.getElementById('status');
const list = document.getElementById('items');
const detail = document.getElementById('detail');
const show = (parent, tag, value) => {
  const element = document.createElement(tag);
  element.textContent = value;
  parent.append(element);
  return element;
};
async function read(path) {
  const response = await fetch(path, { credentials: 'same-origin', cache: 'no-store', redirect: 'error' });
  if (!response.ok) throw new Error(response.status === 401 ? '로그인이 필요합니다.' : response.status === 403 ? '현재 과제 접근 권한이 없습니다.' : '자료를 읽을 수 없습니다.');
  return response.json();
}
async function load() {
  list.replaceChildren(); detail.replaceChildren();
  status.textContent = '불러오는 중…';
  try {
    const data = await read('/api/workbench/feedback-readbox?limit=50');
    status.textContent = data.project_id + ' · ' + data.items.length + '건' + (data.has_more ? ' · 최근 50건 표시' : '');
    for (const item of data.items) {
      const row = show(list, 'article', '');
      show(row, 'h2', item.state);
      show(row, 'p', item.ref);
      show(row, 'p', '관찰 시각: ' + item.observed_at + ' · 검토 결과: ' + (item.review?.status ?? 'UNKNOWN'));
      show(row, 'p', '로컬 기록: ' + (item.local_recorded ? '저장됨' : 'UNKNOWN') + ' · Buzz 전달: ' + (item.buzz_delivery?.status ?? item.buzz_delivery ?? 'UNKNOWN'));
      show(row, 'p', '실제 사람 수락: UNKNOWN · 공식 완료: 확인하지 않음');
      if (item.reason) show(row, 'p', item.reason);
      const button = show(row, 'button', '근거 메타데이터 보기');
      button.type = 'button';
      button.addEventListener('click', async () => {
        detail.replaceChildren();
        try {
          const query = new URLSearchParams({ ref: item.ref, sha256: item.sha256 });
          const evidence = await read('/api/workbench/feedback-readbox/evidence?' + query);
          show(detail, 'h2', '근거 메타데이터');
          show(detail, 'pre', JSON.stringify(evidence, null, 2));
        } catch (error) { show(detail, 'p', error.message); }
      });
    }
    if (!data.items.length) show(list, 'p', '현재 표시할 기록이 없습니다.');
  } catch (error) { status.textContent = error.message; }
}
document.getElementById('refresh').addEventListener('click', load);
load();
`;

export function renderFeedbackReadboxView() {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>관리자 피드백 읽기</title></head><body>
<main><h1>관리자 피드백 읽기</h1><p>로컬 기록, Buzz 전달 확인(ACK), UNKNOWN, 실제 사람 수락은 별개의 상태입니다. 검토 ACCEPT는 사람 수락이나 공식 완료를 뜻하지 않습니다.</p>
<button id="refresh" type="button">새로고침</button><p id="status" role="status" aria-live="polite"></p><section id="items" aria-label="피드백 기록"></section><section id="detail" aria-label="근거 메타데이터"></section></main>
<script>${feedbackReadboxScript}</script></body></html>`;
}

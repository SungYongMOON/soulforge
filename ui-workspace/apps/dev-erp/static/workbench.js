const $ = id => document.getElementById(id);
const kinds = { minutes: '회의록', report: '보고서', journal: '업무일지', mail_draft: '메일 초안', requirement_crosscheck: '요구사항 대조', deck: '발표자료', fill_missing: '누락 보완' };
const reasons = {
  INTAKE_DISABLED: '이 환경에서는 요청 접수가 아직 켜져 있지 않습니다.',
  INTAKE_STORE_UNAVAILABLE: '요청을 안전하게 저장할 위치를 확인할 수 없습니다.',
  SERVER_BINDING_UNAVAILABLE: '접수 저장 위치와 승인된 업무 연결 정보가 필요합니다.',
  AUTH_REQUIRED: '로그인이 필요합니다.', AUTHORITY_BINDING_UNAVAILABLE: '현재 권한을 확인할 수 없습니다. 업무 연결 정보를 다시 확인해야 합니다.',
  SOURCE_BINDING_NOT_CURRENT: '업무 연결 정보의 유효 기간이 지났습니다. 최신 근거가 필요합니다.',
  SOURCE_DIGEST_MISMATCH: '연결된 자료가 변경되어 현재 판본을 확인할 수 없습니다.',
  CURRENT_EVIDENCE_OR_STORE_UNAVAILABLE: '현재 권한·자료 판본 또는 저장 상태를 확인할 수 없습니다.',
  SOURCE_JSON_INVALID: '연결된 자료를 읽을 수 없습니다.', SCOPE_VIOLATION: '현재 계정에 이 업무 범위의 권한이 없습니다.',
  REQUEST_NOT_FOUND: '현재 계정으로 확인할 수 있는 접수 기록이 없습니다.',
  CSRF_REQUIRED: '로그인 상태가 변경되었습니다. 업무 목록을 새로 확인해 주세요.',
  IDEMPOTENCY_KEY_CONFLICT: '같은 요청의 내용이 달라졌습니다. 업무를 다시 선택해 주세요.',
  LINEAR_TASK_NOT_CURRENT: '공식 업무의 최신 상태가 필요합니다.', TASK_REF_REQUIRED: '연결할 공식 업무가 필요합니다.',
  WORKFLOW_GAP: '이 업무에 연결할 절차가 아직 없습니다.', UNMAPPED_WORK_CANDIDATE: '업무 연결 근거가 더 필요합니다.',
  EXECUTOR_NOT_BOUND: '이 업무에 연결할 실행 방식이 아직 없습니다.',
};
let catalogue = null;
let selected = null;
let payload = null;
let recordId = null;
let busy = false;

function notice(message, warning = false, login = false) {
  $('notice').textContent = message;
  $('notice').classList.toggle('warning', warning);
  if (login) { const link = document.createElement('a'); link.href = '/'; link.textContent = '로그인 화면으로'; $('notice').append(link); }
}
async function api(path, options = {}) {
  const response = await fetch(path, { credentials: 'same-origin', cache: 'no-store', ...options });
  const data = await response.json();
  if (!response.ok) throw { code: data.hold_code ?? (response.status === 401 ? 'AUTH_REQUIRED' : 'CURRENT_EVIDENCE_OR_STORE_UNAVAILABLE') };
  return data;
}
function reportError(error) { const code = error?.code; notice(reasons[code] ?? '현재 상태를 확인할 수 없습니다. 잠시 후 다시 확인해 주세요.', true, code === 'AUTH_REQUIRED'); }
function addText(parent, tag, text, className) {
  const element = document.createElement(tag); element.textContent = text;
  if (className) element.className = className;
  parent.append(element); return element;
}
function details(parent, rows) {
  parent.replaceChildren();
  for (const [label, value] of rows) { addText(parent, 'dt', label); addText(parent, 'dd', value ?? '미확인'); }
}
function refreshPayload() {
  if (!selected) return;
  const revisionPrefix = selected.request.idempotency_key.slice(0, selected.request.idempotency_key.lastIndexOf('.') + 1);
  payload = { ...selected.request, idempotency_key: `${revisionPrefix}${crypto.randomUUID()}`,
    directives: [...document.querySelectorAll('input[name="directive"]:checked')].map(input => input.value).sort() };
  $('submit-request').disabled = busy;
}
function select(entry) {
  if (busy) return;
  selected = entry;
  $('empty-preview').hidden = true; $('request-form').hidden = false;
  $('selection-title').textContent = entry.label;
  const mapped = entry.mapping_status === 'MAPPED' && entry.hold_code === null;
  $('mapping-status').textContent = mapped ? '업무 연결 확인됨' : '준비 정보 필요';
  $('mapping-status').classList.toggle('waiting', !mapped);
  const request = entry.request;
  details($('scope'), [['과제', request.project_code], ['제품', request.product_ref], ['작업 묶음', request.work_package_ref],
    ['단계', request.stage_code], ['산출물', request.artifact_family_id], ['요청 종류', kinds[request.kind] ?? request.kind]]);
  const hashes = entry.source_hashes ?? {};
  details($('source-details'), [['입력 판본', request.input_revision], ['자료 세대', entry.source_generation],
    ['연결 절차', request.blueprint_ref?.workflow_id], ['작업 방식', request.policy_refs.recipe_id],
    ['절차 원본 해시', hashes.blueprint_sha256], ['코드 해시', hashes.code_sha256], ['자료 해시', hashes.data_sha256]]);
  for (const input of document.querySelectorAll('input[name="directive"]')) input.checked = request.directives.includes(input.value);
  for (const button of $('entries').children) button.setAttribute('aria-pressed', String(button.dataset.id === entry.id));
  refreshPayload();
  notice(entry.hold_code ? `${reasons[entry.hold_code] ?? '추가 연결 근거가 필요합니다.'} 접수 기록을 남겨도 실행은 시작되지 않습니다.`
    : '대상과 입력 판본을 확인했습니다. 요청을 접수할 수 있습니다.');
}
async function loadCatalogue() {
  if (busy) return;
  busy = true; $('reload').disabled = true; $('submit-request').disabled = true;
  selected = null; payload = null; catalogue = null;
  $('request-form').hidden = true; $('empty-preview').hidden = false; $('entries').replaceChildren(); $('source-holds').replaceChildren();
  notice('현재 계정의 업무와 자료 판본을 확인하고 있습니다.');
  try {
    catalogue = await api('/api/workbench/catalogue');
    if (!catalogue.enabled) { notice(reasons.INTAKE_DISABLED, true); return; }
    for (const entry of catalogue.entries) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'entry';
      button.dataset.id = entry.id; button.setAttribute('aria-pressed', 'false');
      const top = addText(button, 'span', '', 'entry-top'); addText(top, 'span', entry.request.project_code); addText(top, 'span', kinds[entry.request.kind] ?? entry.request.kind);
      addText(button, 'strong', entry.label); addText(button, 'span', `${entry.request.stage_code} · ${entry.request.artifact_family_id}`, 'slot');
      const ready = entry.mapping_status === 'MAPPED' && entry.hold_code === null;
      addText(button, 'span', ready ? '업무 연결 확인됨' : '준비 정보 필요', `entry-state${ready ? '' : ' waiting'}`);
      button.addEventListener('click', () => select(entry)); $('entries').append(button);
    }
    for (const hold of catalogue.holds) addText($('source-holds'), 'p', reasons[hold.hold_code] ?? '일부 업무는 연결된 자료를 확인한 뒤 선택할 수 있습니다.');
    notice(catalogue.entries.length ? `${catalogue.entries.length}개 업무를 확인했습니다. 접수할 업무를 선택하세요.`
      : '현재 선택 가능한 업무가 없습니다. 권한과 승인된 입력 자료의 연결이 필요합니다.', !catalogue.entries.length);
  } catch (error) { reportError(error); }
  finally { busy = false; $('reload').disabled = false; }
}
function showReceipt(record) {
  recordId = record.request_id; $('receipt-panel').hidden = false;
  const content = $('receipt-content'); content.replaceChildren();
  addText(content, 'p', record.replayed ? '이미 저장된 요청을 확인했습니다.' : '요청이 접수되었습니다.', 'receipt-title');
  addText(content, 'p', `${record.project_code} · ${kinds[record.kind] ?? record.kind} · ${new Date(record.created_at).toLocaleString('ko-KR')}`);
  addText(content, 'p', '실행 시작과 결과 검토는 아직 확인되지 않았습니다.');
  addText(content, 'code', record.request_id);
  history.replaceState(null, '', `#request=${record.request_id}`);
}
$('request-form').addEventListener('change', refreshPayload);
$('request-form').addEventListener('submit', async event => {
  event.preventDefault(); if (busy || !payload || !catalogue) return;
  busy = true; $('submit-request').disabled = true; $('reload').disabled = true;
  try {
    const record = await api('/api/workbench/requests', { method: 'POST', headers: { 'content-type': 'application/json', 'x-csrf-token': catalogue.csrf_token }, body: JSON.stringify(payload) });
    showReceipt(record); notice('요청을 저장했습니다. 접수 기록에서 저장 상태를 다시 확인할 수 있습니다.');
    $('receipt-panel').scrollIntoView({ block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  } catch (error) { reportError(error); }
  finally { busy = false; $('submit-request').disabled = false; $('reload').disabled = false; }
});
async function readReceipt() {
  if (!recordId) return;
  $('refresh-receipt').disabled = true;
  try { showReceipt(await api(`/api/workbench/requests/${recordId}`)); }
  catch (error) { $('receipt-panel').hidden = true; reportError(error); }
  finally { $('refresh-receipt').disabled = false; }
}
$('reload').addEventListener('click', loadCatalogue);
$('refresh-receipt').addEventListener('click', readReceipt);
await loadCatalogue();
const receiptMatch = /^#request=(w_[a-f0-9]{32})$/u.exec(location.hash);
if (receiptMatch) { recordId = receiptMatch[1]; await readReceipt(); }

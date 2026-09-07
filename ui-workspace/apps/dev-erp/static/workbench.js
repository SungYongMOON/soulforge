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
  SYNTHETIC_EXECUTION_DISABLED: '이 환경에서는 합성 실행 체험이 켜져 있지 않습니다.',
  SYNTHETIC_EXECUTION_ONLY: '합성 시험용 과제만 실행할 수 있습니다.',
  EXECUTION_BINDING_UNAVAILABLE: '별도로 승인된 합성 실행 연결 정보가 필요합니다.',
  EXECUTION_BINDING_NOT_CURRENT: '합성 실행 승인의 유효 기간이 지났습니다.',
  EXECUTION_BASIS_CHANGED: '실행 근거가 바뀌어 결과 저장을 멈췄습니다.',
  EXECUTION_TIMEOUT: '시험 실행의 제한 시간이 지나 멈췄습니다.',
  USER_CANCELLED: '요청에 따라 실행을 취소했습니다.',
  RUN_RECOVERY_REQUIRED: '중단된 실행입니다. 자동으로 다시 실행되지 않습니다.',
  RUN_DEADLINE_EXPIRED: '실행 제한 시간이 지났습니다.',
  RUN_STILL_ACTIVE: '이전 실행이 진행 중입니다. 취소하거나 종료 상태를 확인한 뒤 다시 시작해 주세요.',
  EXECUTION_REPLAY_CONFLICT: '저장된 실행 근거와 요청의 근거가 달라 다시 실행할 수 없습니다.',
  SERVER_SHUTDOWN: '서버가 종료되어 실행이 멈췄습니다.',
  CANDIDATE_NOT_AVAILABLE: '현재 받을 수 있는 로컬 후보 파일이 없습니다.',
  CATALOGUE_SELECTION_CHANGED: '현재 승인된 입력 판본과 다릅니다. 업무 목록을 다시 확인해 주세요.',
  REVISION_ALREADY_EXISTS: '이 요청의 다음 판본이 이미 있습니다.',
};
let catalogue = null;
let selected = null;
let payload = null;
let recordId = null;
let busy = false;
let execution = null;
let executionBusy = false;
let executionTimer = null;
let executionReadVersion = 0;
let pollsLeft = 0;

function stopPolling() { clearTimeout(executionTimer); executionTimer = null; executionReadVersion += 1; }
function clearExecution() {
  stopPolling(); execution = null;
  $('execution-content').replaceChildren();
  $('candidate-download').hidden = true; $('candidate-download').removeAttribute('href');
}
function syncControls() {
  const unavailable = busy || executionBusy;
  $('reload').disabled = unavailable;
  $('submit-request').disabled = unavailable || !payload;
  $('refresh-receipt').disabled = unavailable;
  $('revision-request').disabled = unavailable || !recordId || !catalogue?.enabled
    || ['running', 'succeeded'].includes(execution?.execution_state);
  $('execution-panel').hidden = !recordId || catalogue?.synthetic_execution_enabled !== true;
  $('boundary-label').textContent = catalogue?.synthetic_execution_enabled === true ? '합성 실행 시험 환경' : '접수 전용';
  $('start-execution').disabled = unavailable || execution?.status !== 'NOT_STARTED';
  $('cancel-execution').hidden = execution?.execution_state !== 'running';
  $('cancel-execution').disabled = unavailable;
  $('refresh-execution').disabled = unavailable;
  $('candidate-download').setAttribute('aria-disabled', String(unavailable));
}

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
  if (busy || executionBusy) return;
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
  if (busy || executionBusy) return;
  clearExecution();
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
  } catch (error) { $('receipt-panel').hidden = true; reportError(error); }
  finally { busy = false; syncControls(); }
  if (recordId && catalogue?.enabled) await readReceipt();
}
function showReceipt(record) {
  if (recordId !== record.request_id) clearExecution();
  recordId = record.request_id; $('receipt-panel').hidden = false;
  const content = $('receipt-content'); content.replaceChildren();
  addText(content, 'p', record.replayed ? '이미 저장된 요청을 확인했습니다.' : '요청이 접수되었습니다.', 'receipt-title');
  addText(content, 'p', `${record.project_code} · ${kinds[record.kind] ?? record.kind} · ${new Date(record.created_at).toLocaleString('ko-KR')}`);
  addText(content, 'p', '접수 기록이 저장되어 있습니다. 접수만으로 실행이 시작되지는 않습니다.');
  addText(content, 'code', record.request_id);
  history.replaceState(null, '', `#request=${record.request_id}`);
  syncControls();
}
$('request-form').addEventListener('change', refreshPayload);
$('request-form').addEventListener('submit', async event => {
  event.preventDefault(); if (busy || executionBusy || !payload || !catalogue) return;
  busy = true; $('submit-request').disabled = true; $('reload').disabled = true;
  syncControls();
  try {
    const record = await api('/api/workbench/requests', { method: 'POST', headers: { 'content-type': 'application/json', 'x-csrf-token': catalogue.csrf_token }, body: JSON.stringify(payload) });
    showReceipt(record); notice('요청을 저장했습니다. 접수 기록에서 저장 상태를 다시 확인할 수 있습니다.');
    await readExecution(true);
    $('receipt-panel').scrollIntoView({ block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  } catch (error) { reportError(error); }
  finally { busy = false; syncControls(); }
});
async function readReceipt() {
  if (!recordId) return;
  const id = recordId;
  $('refresh-receipt').disabled = true;
  try {
    const record = await api(`/api/workbench/requests/${id}`);
    if (id !== recordId) return;
    showReceipt(record); await readExecution(true);
  } catch (error) {
    if (id !== recordId) return;
    clearExecution(); $('receipt-panel').hidden = true; reportError(error);
  } finally { syncControls(); }
}
function showExecution(result) {
  execution = result;
  const states = { succeeded: '합성 실행 완료', cancelled: '취소됨', hold: '보류됨', failed: '실패' };
  states.running = result.execution_started ? '합성 작업자 실행 중' : '작업자 시작 확인 중';
  const content = $('execution-content'); content.replaceChildren();
  addText(content, 'p', result.status === 'NOT_STARTED' ? '아직 실행하지 않았습니다.' : states[result.execution_state] ?? '상태 확인 필요', 'receipt-title');
  const facts = document.createElement('dl'); facts.className = 'scope'; content.append(facts);
  details(facts, [['실행권', result.run_id ? '확보 기록 있음' : '요청 전'],
    ['작업자 시작', result.execution_started ? '시작 확인됨' : '아직 확인되지 않음'],
    ['로컬 후보', result.local_candidate_stored ? '파일 저장 확인됨' : '저장된 파일 없음']]);
  if (result.hold_code) addText(content, 'p', reasons[result.hold_code] ?? '현재 실행 근거를 확인할 수 없어 보류했습니다.', 'execution-hold');
  if (result.run_id) addText(content, 'code', `실행 기록 ${result.run_id}`);
  const link = $('candidate-download');
  link.hidden = result.local_candidate_stored !== true || !!result.hold_code;
  if (!link.hidden) link.href = `/api/workbench/requests/${recordId}/candidate`;
  else link.removeAttribute('href');
  syncControls();
}
function schedulePoll() {
  clearTimeout(executionTimer);
  if (execution?.run_id && execution.execution_state === 'running' && pollsLeft > 0 && !document.hidden) {
    pollsLeft -= 1;
    executionTimer = setTimeout(() => { void readExecution(); }, 1000);
  } else if (execution?.execution_state === 'running' && pollsLeft === 0) {
    notice('자동 확인을 마쳤습니다. 실행 상태 확인을 눌러 현재 상태를 다시 볼 수 있습니다.');
  }
}
async function readExecution(resumePolling = false) {
  if (!recordId || catalogue?.synthetic_execution_enabled !== true || executionBusy) return;
  const id = recordId; const version = ++executionReadVersion;
  try {
    const result = await api(`/api/workbench/requests/${id}/execution`);
    if (id !== recordId || version !== executionReadVersion) return;
    showExecution(result);
    if (resumePolling) pollsLeft = 60;
    schedulePoll();
  } catch (error) {
    if (id !== recordId || version !== executionReadVersion) return;
    clearExecution();
    syncControls(); reportError(error);
  }
}
async function executionAction(operation) {
  if (!recordId || !catalogue?.csrf_token || busy || executionBusy) return;
  stopPolling(); executionBusy = true; syncControls();
  try {
    const result = await api(`/api/workbench/requests/${recordId}/${operation}`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-csrf-token': catalogue.csrf_token }, body: '{}' });
    if (operation === 'revision') {
      showReceipt(result); notice('같은 대상과 입력 판본으로 다음 요청을 접수했습니다. 합성 실행은 별도로 시작하세요.');
    } else { showExecution(result); pollsLeft = 60; }
  } catch (error) { reportError(error); }
  finally { executionBusy = false; syncControls(); }
  await readExecution(true);
}
async function downloadCandidate(event) {
  event.preventDefault();
  if (busy || executionBusy || $('candidate-download').hidden || !/^w_[a-f0-9]{32}$/u.test(recordId ?? '')) return;
  stopPolling();
  const id = recordId; const version = executionReadVersion;
  const current = () => id === recordId && version === executionReadVersion;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  let objectUrl = null;
  executionBusy = true; syncControls();
  try {
    const response = await fetch(`/api/workbench/requests/${id}/candidate`, {
      credentials: 'same-origin', cache: 'no-store', signal: controller.signal });
    if (!response.ok) {
      let error = null;
      try { error = await response.json(); } catch { /* Use a stable fallback for unavailable responses. */ }
      throw { code: error?.hold_code ?? (response.status === 401 ? 'AUTH_REQUIRED' : 'CANDIDATE_NOT_AVAILABLE') };
    }
    if (!/^text\/plain(?:;|$)/iu.test(response.headers.get('content-type') ?? '') || !response.body) throw { code: 'CANDIDATE_NOT_AVAILABLE' };
    const chunks = []; let size = 0;
    const reader = response.body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 65536 || !current()) { await reader.cancel(); throw { code: 'CANDIDATE_NOT_AVAILABLE' }; }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    if (!current()) return;
    if (size === 0) throw { code: 'CANDIDATE_NOT_AVAILABLE' };
    objectUrl = URL.createObjectURL(new Blob(chunks, { type: 'text/plain;charset=utf-8' }));
    const link = document.createElement('a'); link.href = objectUrl; link.download = `synthetic-${id}.txt`;
    document.body.append(link); link.click(); link.remove();
    notice('로컬 후보 파일 다운로드를 시작했습니다. 외부 제출과 공식 업무 완료는 이루어지지 않았습니다.');
  } catch (error) { if (current()) reportError(error); }
  finally {
    clearTimeout(timeout);
    if (objectUrl) { const downloadedUrl = objectUrl; setTimeout(() => URL.revokeObjectURL(downloadedUrl), 1000); }
    executionBusy = false; syncControls();
  }
}
$('reload').addEventListener('click', loadCatalogue);
$('refresh-receipt').addEventListener('click', readReceipt);
$('start-execution').addEventListener('click', () => executionAction('execution'));
$('cancel-execution').addEventListener('click', () => executionAction('execution/cancel'));
$('revision-request').addEventListener('click', () => executionAction('revision'));
$('refresh-execution').addEventListener('click', () => readExecution(true));
$('candidate-download').addEventListener('click', downloadCandidate);
document.addEventListener('visibilitychange', () => { if (document.hidden) stopPolling(); });
window.addEventListener('pagehide', stopPolling);
await loadCatalogue();
const receiptMatch = /^#request=(w_[a-f0-9]{32})$/u.exec(location.hash);
if (receiptMatch) { recordId = receiptMatch[1]; await readReceipt(); }

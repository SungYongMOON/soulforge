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
  EXECUTION_BINDING_UNAVAILABLE: '현재 업무에 사용할 실행 연결 정보가 필요합니다.',
  EXECUTION_BINDING_NOT_CURRENT: '실행 연결의 유효 기간이 지났습니다.',
  EXECUTION_BASIS_CHANGED: '실행 근거가 바뀌어 결과 저장을 멈췄습니다.',
  EXECUTION_TIMEOUT: '실행의 제한 시간이 지났습니다. 기존 실행 기록을 먼저 확인해 주세요.',
  USER_CANCELLED: '요청에 따라 실행을 취소했습니다.',
  RUN_RECOVERY_REQUIRED: '중단된 실행입니다. 자동으로 다시 실행되지 않습니다.',
  RUN_DEADLINE_EXPIRED: '실행 제한 시간이 지났습니다.',
  RUN_STILL_ACTIVE: '이전 실행이 진행 중입니다. 현재 실행 기록을 먼저 확인해 주세요.',
  EXECUTION_REPLAY_CONFLICT: '저장된 실행 근거와 요청의 근거가 달라 다시 실행할 수 없습니다.',
  SERVER_SHUTDOWN: '서버가 종료되어 실행이 멈췄습니다.',
  CANDIDATE_NOT_AVAILABLE: '현재 받을 수 있는 로컬 후보 파일이 없습니다.',
  CATALOGUE_SELECTION_CHANGED: '현재 승인된 입력 판본과 다릅니다. 업무 목록을 다시 확인해 주세요.',
  REVISION_ALREADY_EXISTS: '이 요청의 다음 판본이 이미 있습니다.',
  HERMES_NATIVE_FEATURE_OFF: '이 환경에서는 Hermes 실행 연결이 켜져 있지 않습니다.',
  HERMES_NATIVE_CURRENT_BINDING_REQUIRED: '현재 Hermes·대화·도구의 연결 근거를 다시 확인해야 합니다.',
  HERMES_NATIVE_ATTEMPT_ALREADY_CONSUMED: '이미 실행을 시도한 요청입니다. 중복 전송하지 않고 기존 실행 기록을 확인합니다.',
  HERMES_NATIVE_TIMEOUT_UNKNOWN: '응답 대기 시간이 지났습니다. 전달 결과는 미확인이며 자동으로 다시 보내지 않습니다.',
  HERMES_NATIVE_CANCELLED_UNKNOWN: '실행 중지를 요청했지만 이미 전달된 업무와 답신 여부는 별도 확인이 필요합니다.',
  HERMES_NATIVE_EXECUTION_UNKNOWN: '실행 결과를 확정할 수 없습니다. 기존 실행 기록을 확인하며 자동으로 다시 보내지 않습니다.',
  HERMES_NATIVE_SESSION_READBACK_UNKNOWN: '대화 기록에서 답신을 확인하지 못했습니다. 같은 요청을 다시 보내기 전에 기존 기록을 확인해야 합니다.',
  HERMES_NATIVE_BRIEF_SOURCE_CHANGED: '전송할 업무의 입력 판본이 변경되어 실행을 보류했습니다.',
  HERMES_NATIVE_PRE_RELEASE_DRIFT: '전송 직전 연결 근거가 달라져 실행을 멈췄습니다.',
  NATIVE_BUZZ_ENTRY_REQUIRED: '업무 지시와 답변은 Buzz에서 진행합니다. 작업대에서는 기록을 확인할 수 있습니다.',
  NATIVE_AUDIT_UNAVAILABLE: '이 요청에 연결된 지시·실행 기록이 아직 없습니다.',
  BUZZ_PILOT_ACCESS_REQUIRED: '현재 계정에 이 Buzz 업무 기록을 조회할 권한이 없습니다.',
  BUZZ_PILOT_RECORD_NOT_FOUND: '조회할 Buzz 업무 또는 보존본이 아직 없습니다.',
  BUZZ_PILOT_UNAVAILABLE: 'Buzz 업무의 조회 연결을 확인할 수 없습니다. 운영 연결 상태를 확인해 주세요.',
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
let logReadVersion = 0;
let buzzPilot = null;
let buzzReadVersion = 0;

function buzzReadOnly() {
  return buzzPilot !== null || catalogue?.execution_mode === 'native_chat'
    && catalogue?.native_instruction_entry === 'buzz' && catalogue?.execution_enabled !== true;
}
function executionReadable() {
  return catalogue?.execution_read_enabled === true || currentExecutionMode() !== null;
}

function currentExecutionMode() {
  if (catalogue?.execution_mode === undefined) {
    return catalogue?.synthetic_execution_enabled === true && catalogue?.execution_enabled !== false ? 'synthetic_fixed' : null;
  }
  if (catalogue.execution_enabled !== true) return null;
  if (catalogue.execution_mode === 'native_chat' && catalogue.native_execution_enabled === true) return 'native_chat';
  if (catalogue.execution_mode === 'synthetic_fixed' && catalogue.synthetic_execution_enabled === true) return 'synthetic_fixed';
  return null;
}
function observedExecutionMode(result = execution) {
  if (result?.execution_mode === 'native_chat' || result?.execution_mode === 'synthetic_fixed') return result.execution_mode;
  if (catalogue?.execution_read_enabled === true && catalogue.execution_mode === 'native_chat') return 'native_chat';
  return currentExecutionMode();
}
function clearExecutionLog() {
  logReadVersion += 1;
  $('execution-log-panel').hidden = true;
  $('execution-log-content').replaceChildren();
  for (const id of ['instruction-download', 'output-download']) {
    $(id).hidden = true; $(id).removeAttribute('href');
  }
}
function stopPolling() { clearTimeout(executionTimer); executionTimer = null; executionReadVersion += 1; }
function clearExecution() {
  stopPolling(); execution = null;
  $('execution-content').replaceChildren();
  $('candidate-download').hidden = true; $('candidate-download').removeAttribute('href');
  clearExecutionLog();
}
function syncControls() {
  const unavailable = busy || executionBusy;
  const mode = currentExecutionMode();
  const native = observedExecutionMode() === 'native_chat';
  const readOnly = buzzReadOnly();
  const nativeAttemptExists = native && !!execution?.run_id;
  $('reload').disabled = unavailable;
  $('submit-request').disabled = unavailable || readOnly || !payload;
  $('submit-area').hidden = readOnly;
  $('directive-options').disabled = readOnly;
  $('directive-options').hidden = readOnly;
  $('revision-area').hidden = readOnly;
  $('refresh-receipt').disabled = unavailable;
  $('revision-request').disabled = unavailable || !recordId || !catalogue?.enabled
    || nativeAttemptExists || ['running', 'succeeded', 'response_observed'].includes(execution?.execution_state);
  $('execution-panel').hidden = !recordId || (!executionReadable() && !execution?.run_id);
  $('boundary-label').textContent = readOnly ? 'Buzz에서 진행 · 조회 전용' : mode === 'native_chat' ? '개발 점검용 실행' : mode === 'synthetic_fixed' ? '합성 실행 시험 환경' : '접수 전용';
  $('workbench-title').textContent = readOnly ? '업무를 살펴보는 작업대' : '업무를 준비하는 작업대';
  $('workbench-intro').textContent = readOnly ? 'Buzz에서 맡긴 업무의 진행과 기록을 확인하세요.' : '확인된 업무와 입력 판본을 선택하고, 요청을 남기세요.';
  $('workbench-purpose').textContent = readOnly ? '업무 조회' : '업무 요청';
  $('workbench-steps').setAttribute('aria-label', readOnly ? '조회 순서' : '요청 순서');
  $('workbench-steps').hidden = buzzPilot !== null;
  const lastStep = $('workbench-steps').lastElementChild;
  lastStep.lastChild.textContent = readOnly ? ' 기록 조회' : ' 요청 접수';
  $('preview-title').textContent = readOnly ? '업무 정보' : '요청 미리보기';
  $('execution-title').textContent = readOnly ? '업무 진행' : native ? 'Hermes 작업 요청' : '합성 실행 체험';
  $('execution-kind').textContent = readOnly ? '상태 조회' : native ? '봇 실행' : '로컬 시험';
  $('execution-description').textContent = readOnly
    ? '지시와 답변은 Buzz에서 진행합니다. 여기서는 확인된 진행 상태와 결과 기록을 봅니다.' : native
    ? '연결된 Hermes에 업무를 보냅니다. 답신과 산출물 보관·검토 상태는 따로 확인합니다.'
    : '고정된 합성 작업자가 시험용 파일을 만듭니다. 외부 제출과 공식 업무 완료는 이루어지지 않습니다.';
  $('start-execution').hidden = readOnly;
  $('start-execution').textContent = mode === 'native_chat' ? 'Hermes에 실행 요청' : '합성 실행 체험';
  $('start-execution').disabled = unavailable || !mode || !!execution?.hold_code || execution?.status !== 'NOT_STARTED';
  $('cancel-execution').textContent = native ? '실행 중지 요청' : '실행 취소';
  $('cancel-execution').hidden = readOnly || execution?.execution_state !== 'running';
  $('cancel-execution').disabled = unavailable;
  $('refresh-execution').disabled = unavailable;
  $('candidate-download').setAttribute('aria-disabled', String(unavailable));
  $('revision-description').textContent = nativeAttemptExists
    ? '이 요청에는 이미 실행 기록이 있습니다. 같은 업무가 중복 전송되지 않도록 기존 기록을 먼저 확인합니다.'
    : '다시 시도할 때는 같은 대상과 입력 판본으로 다음 접수 기록을 만듭니다.';
}

function safeLoginUrl(value) {
  try {
    if (typeof value !== 'string') return null;
    const url = new URL(value);
    return url.protocol === 'http:' && location.protocol === 'http:' && url.hostname === location.hostname
      && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) && !url.username && !url.password
      && url.pathname === '/' && !url.search && !url.hash ? url.href : null;
  } catch { return null; }
}
function notice(message, warning = false, login = false, loginUrl = null) {
  $('notice').textContent = message;
  $('notice').classList.toggle('warning', warning);
  if (login) {
    const source = safeLoginUrl(loginUrl), link = document.createElement('a');
    link.href = source ?? '/'; link.textContent = source ? '기존 서버에서 로그인' : '로그인 화면으로'; $('notice').append(link);
  }
}
async function api(path, options = {}) {
  const response = await fetch(path, { credentials: 'same-origin', cache: 'no-store', ...options });
  const data = await response.json();
  if (!response.ok) throw { status: response.status, code: data.hold_code ?? (response.status === 401 ? 'AUTH_REQUIRED' : 'CURRENT_EVIDENCE_OR_STORE_UNAVAILABLE'),
    login_url: response.status === 401 ? data.login_url : undefined };
  return data;
}
function reportError(error) { const code = error?.code; notice(reasons[code] ?? '현재 상태를 확인할 수 없습니다. 잠시 후 다시 확인해 주세요.', true, code === 'AUTH_REQUIRED', error?.login_url); }
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
  if (buzzReadOnly()) { payload = null; syncControls(); return; }
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
  notice(buzzReadOnly() ? '선택한 업무의 범위와 입력 판본입니다. 지시와 답변은 Buzz에서 진행하세요.' : entry.hold_code ? `${reasons[entry.hold_code] ?? '추가 연결 근거가 필요합니다.'} 접수 기록을 남겨도 실행은 시작되지 않습니다.`
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
    notice(catalogue.entries.length ? `${catalogue.entries.length}개 업무를 확인했습니다. ${buzzReadOnly() ? '조회할 업무를 선택하세요.' : '접수할 업무를 선택하세요.'}`
      : '현재 선택 가능한 업무가 없습니다. 권한과 승인된 입력 자료의 연결이 필요합니다.', !catalogue.entries.length);
  } catch (error) { $('receipt-panel').hidden = true; reportError(error); }
  finally { busy = false; syncControls(); }
  if (recordId && catalogue?.enabled) await readReceipt();
  else if (recordId) await readExecutionLog();
}
function showReceipt(record) {
  if (recordId !== record.request_id) clearExecution();
  recordId = record.request_id; $('receipt-panel').hidden = false;
  const content = $('receipt-content'); content.replaceChildren();
  addText(content, 'p', buzzReadOnly() ? '저장된 요청 기록' : record.replayed ? '이미 저장된 요청을 확인했습니다.' : '요청이 접수되었습니다.', 'receipt-title');
  addText(content, 'p', `${record.project_code} · ${kinds[record.kind] ?? record.kind} · ${new Date(record.created_at).toLocaleString('ko-KR')}`);
  addText(content, 'p', '접수 기록이 저장되어 있습니다. 접수만으로 실행이 시작되지는 않습니다.');
  addText(content, 'code', record.request_id);
  history.replaceState(null, '', `#request=${record.request_id}`);
  syncControls();
}
$('request-form').addEventListener('change', refreshPayload);
$('request-form').addEventListener('submit', async event => {
  event.preventDefault(); if (buzzReadOnly() || busy || executionBusy || !payload || !catalogue) return;
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
    showReceipt(record); await readExecution(true, false);
  } catch (error) {
    if (id !== recordId) return;
    clearExecution(); $('receipt-panel').hidden = true; reportError(error);
  } finally { syncControls(); }
  await readExecutionLog();
}

function displayTime(value) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString('ko-KR') : '미확인';
}
const buzzStates = { issued: 'Buzz 수신 확인 전', running: '업무 진행 중', tool_running: '질문 도구 실행 중',
  question_registered: '질문 등록됨 · 전달 확인 전', waiting_owner: '답변 대기 확인 필요', answer_received: '답변 수신 기록됨',
  answer_accepted: '답변 연결 확인됨', resumed: '업무 재개 확인됨', tool_completed: '질문 도구 종료됨',
  final_produced: '최종 응답 생성됨 · 전달 확인 전', delivered: '최종 응답 전달됨',
  question_delivery_failed: '질문 전달 실패', question_delivery_unknown: '질문 전달 여부 미확인',
  final_delivery_failed: '최종 응답 전달 실패', final_delivery_unknown: '최종 응답 전달 여부 미확인',
  failed: '실행 실패', cancelled: '실행 중지됨', capture_incomplete: '실행 기록 보존 확인 필요', expired: '업무 연결 기한 지남' };
const buzzEvents = { instruction_received: 'Buzz에서 지시 수신', tool_started: '질문 도구 시작',
  question_registered: '질문 등록', question_delivery: '질문 전달 기록', answer_received: '답변 수신',
  answer_accepted: '답변 연결 확인', resumed: '업무 재개', tool_completed: '질문 도구 종료',
  final_response: '최종 응답 생성', final_delivery: '최종 응답 전달 기록', failed: '실패 기록', cancelled: '중지 기록' };
const buzzRoles = { instruction: '발행한 지시', original_message: 'Buzz 수신 지시', question: '질문', answer: '답변',
  tool_input: '질문 도구 입력', tool_output: '질문 도구 출력', final_response: '최종 응답' };
function showBuzzPilot(value) {
  buzzPilot = value;
  if (!recordId) { clearExecution(); $('receipt-panel').hidden = true; }
  $('legacy-workspace').hidden = true;
  $('buzz-pilot-panel').hidden = false;
  syncControls();
  const waiting = value.state === 'waiting_owner' && value.owner_action_required === true;
  $('buzz-pilot-status').textContent = waiting ? '담당자 답변을 기다리고 있습니다.' : buzzStates[value.state] ?? '상태 확인 필요';
  const attention = $('buzz-pilot-attention');
  attention.hidden = !waiting && value.operations_attention !== true;
  attention.classList.toggle('warning', value.operations_attention === true);
  attention.textContent = waiting ? 'Buzz에 전달된 질문에 답변해 주세요.'
    : '운영 확인이 필요한 상태입니다. 이 기록을 확인한 뒤 진행 여부를 판단하세요.';
  const rows = [['업무', value.task_id], ['과제', value.project_id], ['지시 경로', 'Buzz'],
    ['기록 수', String(value.sequence ?? 0)], ['지시 발행', displayTime(value.issued_at)],
    ['최종 응답', value.final_produced === true ? '생성 기록 있음' : '아직 생성 확인 전'],
    ['응답 전달', value.final_delivered === true ? '전달 기록 있음' : value.delivery_status === 'failed' ? '전달 실패' : '전달 확인 전'],
    ['결과 검증', '미검증'], ['사람 수락', '미수락'], ['공식 업무 완료', '미완료']];
  if (waiting) rows.splice(4, 0, ['답변 담당자', value.expected_responder?.account_id ?? '미확인'],
    ['대기 시작', displayTime(value.wait_started_at)], ['대기 시간', Number.isFinite(value.wait_elapsed_ms)
      ? `${Math.floor(Math.max(0, value.wait_elapsed_ms) / 60000)}분` : '미확인']);
  details($('buzz-pilot-facts'), rows);
  const buzzLink = $('buzz-pilot-link'); buzzLink.hidden = true; buzzLink.removeAttribute('href');
  if (/^buzz:\/\/(?:channel\/[a-f0-9-]{36}|message\?channel=[a-f0-9-]{36}&id=[a-f0-9]{64})$/u.test(value.buzz_url ?? '')) {
    buzzLink.href = value.buzz_url; buzzLink.hidden = false;
  }
  const events = $('buzz-pilot-events'); events.replaceChildren();
  const evidence = $('buzz-pilot-evidence'); evidence.replaceChildren();
  const seen = new Set();
  function evidenceLink(pin, observationId) {
    if (!pin || !Object.hasOwn(buzzRoles, pin.role) || seen.has(pin.ref)) return;
    if (observationId !== undefined && !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$/u.test(observationId)) return;
    if (observationId === undefined && pin.role !== 'instruction') return;
    seen.add(pin.ref);
    const params = new URLSearchParams({ role: pin.role });
    if (observationId !== undefined) params.set('observation_id', observationId);
    const link = addText(evidence, 'a', `${buzzRoles[pin.role]} 보존본`, 'candidate-download');
    link.href = `/api/workbench/buzz-pilot/evidence?${params}`;
  }
  evidenceLink(value.evidence_refs?.find(pin => pin.role === 'instruction'));
  for (const event of Array.isArray(value.event_refs) ? value.event_refs : []) {
    addText(events, 'li', buzzEvents[event.event_type] ?? '기록된 사건');
    for (const pin of Array.isArray(event.evidence_refs) ? event.evidence_refs : []) evidenceLink(pin, event.observation_id);
  }
  if (!events.children.length) addText(events, 'li', '아직 Buzz 수신 이후의 사건이 기록되지 않았습니다.');
  if (!evidence.children.length) addText(evidence, 'p', '아직 조회할 수 있는 보존본이 없습니다.', 'helper');
  notice('지시와 답변은 Buzz에서 진행합니다. 확인된 사건과 보존본만 표시합니다.');
}
async function loadBuzzPilot() {
  const version = ++buzzReadVersion;
  $('refresh-buzz-pilot').disabled = true;
  try {
    const value = await api('/api/workbench/buzz-pilot');
    if (version !== buzzReadVersion) return true;
    if (value?.version !== 1 || typeof value.job_id !== 'string' || !Array.isArray(value.event_refs)) throw { code: 'BUZZ_PILOT_UNAVAILABLE' };
    showBuzzPilot(value);
    if (recordId && catalogue?.enabled) await readReceipt();
    return true;
  } catch (error) {
    if (version !== buzzReadVersion) return true;
    if (buzzPilot === null && error.status === 404 && ['BUZZ_PILOT_DISABLED', 'CURRENT_EVIDENCE_OR_STORE_UNAVAILABLE'].includes(error.code)) return false;
    $('buzz-pilot-panel').hidden = true; $('legacy-workspace').hidden = true;
    $('receipt-panel').hidden = true; clearExecution(); reportError(error); return true;
  } finally { if (version === buzzReadVersion) $('refresh-buzz-pilot').disabled = false; }
}
async function readExecutionLog() {
  if (!/^w_[a-f0-9]{32}$/u.test(recordId ?? '') || catalogue?.execution_mode === 'synthetic_fixed') return;
  const id = recordId;
  clearExecutionLog(); const activeVersion = logReadVersion;
  try {
    const value = await api(`/api/workbench/requests/${id}/execution-log`);
    if (id !== recordId || activeVersion !== logReadVersion || value.request_id !== id) return;
    const header = value.trace?.header;
    if (!header?.context || !header.instruction_snapshot) throw { code: 'NATIVE_AUDIT_UNAVAILABLE' };
    const context = header.context;
    const evidence = value.trace.final?.evidence;
    const content = $('execution-log-content');
    const facts = document.createElement('dl'); facts.className = 'scope'; content.append(facts);
    const entryNames = { buzz: 'Buzz', native_cli: '직접 호출 기록', workbench: '작업대 개발 점검' };
    if (context.entrypoint !== 'buzz') addText(content, 'p', '이 이력은 Buzz 대화에서 수집한 기록이 아닙니다. 표시된 지시 경로의 실행 근거입니다.', 'notice warning');
    details(facts, [['업무 기록', value.work_id], ['지시 경로', entryNames[context.entrypoint] ?? '미확인'],
      ['요청자 식별자', context.requester_ref], ['지시 보관 시각', displayTime(context.recorded_at)],
      ['요청한 모델', context.performer?.requested_model ?? '미확인'],
      ['출력 보관', value.trace.final?.output_snapshot ? '보관됨' : '아직 확인되지 않음']]);
    const attempts = Array.isArray(value.attempts) ? value.attempts : [];
    if (attempts.length) {
      addText(content, 'h3', '실행 이력');
      const list = document.createElement('ul'); list.className = 'audit-events'; content.append(list);
      const stateNames = { running: '진행 중', succeeded: '응답 관측', response_observed: '응답 관측', hold: '보류', failed: '실패', cancelled: '중지' };
      for (const attempt of attempts) addText(list, 'li', `${displayTime(attempt.started_at)} · ${stateNames[attempt.state] ?? '상태 미확인'}${attempt.reason_code ? ` · ${reasons[attempt.reason_code] ?? '추가 확인 필요'}` : ''}`);
    }
    const tools = evidence?.tool_records;
    addText(content, 'h3', '관측된 도구 기록');
    if (Array.isArray(tools) && tools.length) {
      const list = document.createElement('ul'); list.className = 'audit-events'; content.append(list);
      for (const tool of tools) addText(list, 'li', `${tool.tool_name ?? tool.tool_call_ref ?? '도구 미확인'} · ${tool.phase === 'request_observed' ? '요청 관측' : tool.phase === 'result_row_observed' ? '응답 기록 관측' : '단계 미확인'} · ${displayTime(tool.occurred_at)}`);
      addText(content, 'p', '도구 요청·응답 기록의 관측입니다. 실제 변경과 성공 여부는 해당 실행 근거로 별도 확인합니다.', 'helper');
    } else addText(content, 'p', Array.isArray(tools) ? '이 관측 범위에 도구 기록이 없습니다.' : '아직 연결된 도구 관측 근거가 없습니다.', 'helper');
    const delivery = document.createElement('details'); delivery.className = 'source-details'; content.append(delivery);
    addText(delivery, 'summary', '전달·검증 근거');
    const deliveryFacts = document.createElement('dl'); deliveryFacts.className = 'scope'; delivery.append(deliveryFacts);
    details(deliveryFacts, [['지시 보관 해시', header.instruction_snapshot.content_sha256],
      ['호출기 전달 기록', evidence?.pipe_write_completed === true ? '기록 있음' : '미확인'],
      ['실행기 수신 확인', '미확인'], ['모델 수신 확인', '미확인'],
      ['산출물 검토·수락', '이 기록의 확인 범위 밖']]);
    for (const [role, target] of [['instruction', 'instruction-download'], ['output', 'output-download']]) {
      const exists = role === 'instruction' || !!value.trace.final?.output_snapshot;
      $(target).hidden = !exists;
      if (exists) $(target).href = `/api/workbench/requests/${id}/execution-log/${role}`;
    }
    $('execution-log-panel').hidden = false;
  } catch (error) {
    if (id !== recordId || activeVersion !== logReadVersion) return;
    clearExecutionLog();
    if (catalogue?.execution_log_enabled === true) {
      $('execution-log-panel').hidden = false;
      addText($('execution-log-content'), 'p', reasons[error?.code] ?? '현재 권한 또는 보존된 실행 근거를 확인할 수 없습니다.', 'helper');
    }
  }
}
function showExecution(result) {
  execution = result;
  const native = observedExecutionMode(result) === 'native_chat';
  const responseObserved = native && result.execution_state === 'response_observed' && result.response_observed === true;
  const candidateStored = !native && result.local_candidate_stored === true;
  const states = { succeeded: native ? '상태 확인 필요' : '합성 실행 완료',
    cancelled: native ? '실행 중지 상태' : '취소됨', hold: '보류됨', failed: '실패',
    response_observed: responseObserved ? 'Hermes 응답 확인' : '응답 확인 근거 필요' };
  states.running = result.execution_started ? (native ? 'Hermes 작업 진행 중' : '합성 작업자 실행 중') : '작업자 시작 확인 중';
  const content = $('execution-content'); content.replaceChildren();
  addText(content, 'p', result.status === 'NOT_STARTED'
    ? (result.hold_code ? '실행 준비 확인 필요' : '아직 실행하지 않았습니다.')
    : states[result.execution_state] ?? '상태 확인 필요', 'receipt-title');
  const facts = document.createElement('dl'); facts.className = 'scope'; content.append(facts);
  const rows = [['실행 방식', native ? 'Hermes' : '합성 시험'], ['실행권', result.run_id ? '확보 기록 있음' : '요청 전'],
    ['작업자 시작', result.execution_started ? '시작 확인됨' : '아직 확인되지 않음'],
    [native ? '산출물 보관' : '로컬 후보', native ? '별도 확인 필요' : candidateStored ? '파일 저장 확인됨' : '저장된 파일 없음']];
  if (native) rows.splice(3, 0, ['Hermes 응답', responseObserved ? '현재 대화에서 확인됨' : '아직 확인되지 않음']);
  details(facts, rows);
  if (responseObserved) addText(content, 'p', '답신 확인 기록입니다. 산출물 보관·검토·수락은 별도로 확인합니다.', 'helper');
  if (native && result.execution_state === 'cancelled') addText(content, 'p', '이미 수행된 작업과 답신 여부는 기존 실행 기록에서 확인해야 합니다.', 'helper');
  if (result.hold_code) addText(content, 'p', reasons[result.hold_code] ?? '현재 실행 근거를 확인할 수 없어 보류했습니다.', 'execution-hold');
  if (result.run_id) addText(content, 'code', `실행 기록 ${result.run_id}`);
  const link = $('candidate-download');
  link.hidden = !candidateStored || !!result.hold_code;
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
async function readExecution(resumePolling = false, refreshLog = true) {
  if (!recordId || (!executionReadable() && !execution?.run_id) || executionBusy) return;
  const id = recordId; const version = ++executionReadVersion;
  try {
    const result = await api(`/api/workbench/requests/${id}/execution`);
    if (id !== recordId || version !== executionReadVersion) return;
    showExecution(result);
    if (refreshLog && result.execution_state !== 'running') void readExecutionLog();
    if (resumePolling) pollsLeft = 60;
    schedulePoll();
  } catch (error) {
    if (id !== recordId || version !== executionReadVersion) return;
    clearExecution();
    syncControls(); reportError(error);
  }
}
async function executionAction(operation) {
  if (buzzReadOnly()) { notice(reasons.NATIVE_BUZZ_ENTRY_REQUIRED); return; }
  if (!recordId || !catalogue?.csrf_token || busy || executionBusy) return;
  stopPolling(); executionBusy = true; syncControls();
  try {
    const result = await api(`/api/workbench/requests/${recordId}/${operation}`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-csrf-token': catalogue.csrf_token }, body: '{}' });
    if (operation === 'revision') {
      showReceipt(result); notice('같은 대상과 입력 판본으로 다음 요청을 접수했습니다. 실행은 별도로 요청하세요.');
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
$('refresh-execution-log').addEventListener('click', readExecutionLog);
$('refresh-buzz-pilot').addEventListener('click', loadBuzzPilot);
$('candidate-download').addEventListener('click', downloadCandidate);
document.addEventListener('visibilitychange', () => { if (document.hidden) stopPolling(); });
window.addEventListener('pagehide', stopPolling);
const buzzHandled = await loadBuzzPilot();
const receiptMatch = /^#request=(w_[a-f0-9]{32})$/u.exec(location.hash);
if (receiptMatch) recordId = receiptMatch[1];
if (!buzzHandled || buzzPilot !== null && recordId) {
  await loadCatalogue();
}

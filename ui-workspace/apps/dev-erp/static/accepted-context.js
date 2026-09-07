const $ = (id) => document.getElementById(id);
const SCOPE_LABELS = { project: '과제 맥락', common: '공통 맥락' };
const LANE_LABELS = { mail: '메일', voice: '음성', plaud: '음성', pc_file: 'PC 파일', codex: '작업 맥락', slack: 'Slack', linear: 'Linear', knowledge: '지식', common: '공통 자료' };
const NOT_AVAILABLE = '현재 조회할 수 없습니다. 잠시 후 다시 확인해 주세요.';
const dateFormat = new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'medium' });
let entries = [];
let cursor = null;
let page = 0;
let busy = false;
let requestVersion = 0;
let controller = null;

function setNotice(message, unavailable = false) {
  $('notice').textContent = message;
  $('notice').classList.toggle('warning', unavailable);
  $('notice').dataset.state = unavailable ? 'NOT_AVAILABLE' : 'ok';
  $('login-help').hidden = !unavailable;
}

function currentEntry() {
  const value = $('selection').value;
  const entry = value === '' ? null : entries[Number(value)];
  return entry?.scope === $('scope').value ? entry : null;
}

function selectedInstant() {
  if (!$('as-of').value || !$('as-of').validity.valid) return null;
  const date = new Date($('as-of').value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function updateControls() {
  const ready = Boolean(currentEntry() && selectedInstant());
  $('query').disabled = busy || !ready;
  $('next-page').disabled = busy || !ready || cursor === null;
  $('reload').disabled = busy && entries.length === 0;
  $('results-panel').setAttribute('aria-busy', String(busy));
}

function clearResults(title = '조건을 선택하고 조회하세요') {
  cursor = null;
  page = 0;
  $('results').replaceChildren();
  $('page-label').textContent = '';
  $('result-context').textContent = '원문 없이 수락 메타데이터만 표시합니다.';
  $('empty-title').textContent = title;
  $('empty').hidden = false;
  $('pagination').hidden = true;
  $('next-page').disabled = true;
}

function invalidate() {
  requestVersion += 1;
  controller?.abort();
  controller = null;
  busy = false;
  clearResults();
}

function unavailable() {
  clearResults('조회 결과를 표시할 수 없습니다');
  setNotice(NOT_AVAILABLE, true);
}

function beginRequest() {
  invalidate();
  controller = new AbortController();
  busy = true;
  updateControls();
  return { version: requestVersion, signal: controller.signal };
}

function finishRequest(version) {
  if (version !== requestVersion) return;
  busy = false;
  controller = null;
  updateControls();
}

async function request(path, options) {
  const response = await fetch(path, { credentials: 'same-origin', mode: 'same-origin', redirect: 'error', cache: 'no-store', ...options });
  if (!response.ok) throw new Error('NOT_AVAILABLE');
  const data = await response.json();
  if (data?.status !== 'ok') throw new Error('NOT_AVAILABLE');
  return data;
}

function localInstant(value) {
  const date = new Date(value);
  const pad = (number, width = 2) => String(number).padStart(width, '0');
  return `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`;
}

function setDefaultInstant() {
  const entry = currentEntry();
  $('as-of').value = entry ? localInstant(entry.as_of) : '';
  $('as-of').disabled = !entry;
}

function populateSelections() {
  $('selection').replaceChildren();
  entries.forEach((entry, index) => {
    if (entry.scope !== $('scope').value) return;
    const option = document.createElement('option');
    option.value = String(index);
    option.textContent = entry.project_label;
    $('selection').append(option);
  });
  $('selection').disabled = $('selection').options.length === 0;
  setDefaultInstant();
}

function validEntry(entry) {
  return entry && typeof entry.selection_id === 'string' && entry.selection_id.length > 0
    && typeof entry.project_label === 'string' && entry.project_label.trim().length > 0
    && Object.hasOwn(SCOPE_LABELS, entry.scope) && entry.purpose === 'pilot_context_query'
    && typeof entry.as_of === 'string' && Number.isFinite(Date.parse(entry.as_of));
}

async function loadCatalogue() {
  entries = [];
  $('scope').replaceChildren();
  $('scope').disabled = true;
  populateSelections();
  const { version, signal } = beginRequest();
  setNotice('조회 가능한 범위를 확인하고 있습니다.');
  try {
    const data = await request('/api/context/accepted/catalogue', { signal });
    if (version !== requestVersion) return;
    if (!Array.isArray(data.entries) || data.entries.length === 0 || !data.entries.every(validEntry)
      || new Set(data.entries.map((entry) => entry.selection_id)).size !== data.entries.length) throw new Error('NOT_AVAILABLE');
    entries = data.entries;
    for (const [scope, label] of Object.entries(SCOPE_LABELS)) {
      if (!entries.some((entry) => entry.scope === scope)) continue;
      const option = document.createElement('option');
      option.value = scope;
      option.textContent = label;
      $('scope').append(option);
    }
    $('scope').disabled = false;
    populateSelections();
    setNotice('조회 범위를 확인했습니다. 과제와 기준 시각을 선택하고 조회하세요.');
  } catch {
    if (version === requestVersion) unavailable();
  } finally {
    finishRequest(version);
  }
}

function validHit(hit) {
  return hit && ['source_span_ref', 'source_lane', 'context_event_ref', 'context_unit_ref', 'context_branch_ref'].every((key) => typeof hit[key] === 'string' && hit[key].length > 0)
    && typeof hit.source_revision_ref?.entity_id === 'string' && typeof hit.source_revision_ref?.revision_id === 'string'
    && ['valid_at', 'known_at'].every((key) => typeof hit[key] === 'string' && Number.isFinite(Date.parse(hit[key])));
}

function addField(list, label, value) {
  const term = document.createElement('dt');
  const description = document.createElement('dd');
  term.textContent = label;
  description.textContent = value;
  list.append(term, description);
}

function renderHits(hits) {
  const fragment = document.createDocumentFragment();
  hits.forEach((hit, index) => {
    const card = document.createElement('article');
    card.className = 'result-card';
    const heading = document.createElement('h3');
    heading.textContent = `${LANE_LABELS[hit.source_lane] || '자료'} 참조 ${index + 1}`;
    const dates = document.createElement('dl');
    dates.className = 'reference-fields';
    addField(dates, '자료 기준', dateFormat.format(new Date(hit.valid_at)));
    addField(dates, '확인 시각', dateFormat.format(new Date(hit.known_at)));
    const details = document.createElement('details');
    const summary = document.createElement('summary');
    summary.textContent = '참조 정보';
    const refs = document.createElement('dl');
    refs.className = 'reference-fields identifiers';
    addField(refs, '자료 구간', hit.source_span_ref);
    addField(refs, '자료', hit.source_revision_ref.entity_id);
    addField(refs, '판본', hit.source_revision_ref.revision_id);
    addField(refs, '사건', hit.context_event_ref);
    addField(refs, '맥락 단위', hit.context_unit_ref);
    addField(refs, '맥락 갈래', hit.context_branch_ref);
    details.append(summary, refs);
    card.append(heading, dates, details);
    fragment.append(card);
  });
  $('results').replaceChildren(fragment);
  $('empty').hidden = hits.length > 0;
  $('empty-title').textContent = '이 조건에서 조회된 수락 메타데이터가 없습니다';
}

async function queryContext(next = false) {
  if (busy) return;
  const entry = currentEntry();
  const asOf = selectedInstant();
  const requestedCursor = next ? cursor : null;
  const requestedPage = next ? page + 1 : 1;
  if (!entry || !asOf || (next && requestedCursor === null)) {
    invalidate();
    unavailable();
    updateControls();
    return;
  }
  const { version, signal } = beginRequest();
  setNotice('수락된 맥락을 조회하고 있습니다.');
  $('empty-title').textContent = '조회하고 있습니다';
  try {
    const data = await request('/api/context/accepted/query', {
      method: 'POST', signal, headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ selection_id: entry.selection_id, as_of: asOf, cursor: requestedCursor }),
    });
    if (version !== requestVersion) return;
    if (!Array.isArray(data.hits) || !data.hits.every(validHit)
      || !(data.cursor === null || (typeof data.cursor === 'string' && data.cursor.length > 0))) throw new Error('NOT_AVAILABLE');
    renderHits(data.hits);
    cursor = data.cursor;
    page = requestedPage;
    $('page-label').textContent = `${page}페이지 · ${data.hits.length}건`;
    $('result-context').textContent = `${entry.project_label} · ${SCOPE_LABELS[entry.scope]} · ${dateFormat.format(new Date(asOf))} 기준`;
    $('pagination').hidden = cursor === null;
    setNotice(`${page}페이지에서 ${data.hits.length}건을 확인했습니다.${cursor === null ? ' 마지막 페이지입니다.' : ' 다음 페이지를 조회할 수 있습니다.'}`);
  } catch {
    if (version === requestVersion) unavailable();
  } finally {
    finishRequest(version);
  }
}

function conditionsChanged(event) {
  invalidate();
  if (event.target === $('scope')) populateSelections();
  if (event.target === $('selection')) setDefaultInstant();
  setNotice('조회 조건이 바뀌었습니다. 조회하기를 눌러 새 결과를 확인하세요.');
  updateControls();
}

for (const id of ['scope', 'selection', 'as-of']) {
  $(id).addEventListener('input', conditionsChanged);
  $(id).addEventListener('change', conditionsChanged);
}
$('query-form').addEventListener('submit', (event) => { event.preventDefault(); queryContext(); });
$('next-page').addEventListener('click', () => queryContext(true));
$('reload').addEventListener('click', loadCatalogue);
$('time-help').textContent = `이 기기의 시간대(${dateFormat.resolvedOptions().timeZone})를 사용합니다. 처음 표시되는 시각은 선택한 범위의 기본값입니다.`;
window.addEventListener('pagehide', () => { invalidate(); updateControls(); });
window.addEventListener('pageshow', (event) => { if (event.persisted) loadCatalogue(); });
loadCatalogue();

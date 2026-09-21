import { useEffect, useState } from 'react';
import { Tag, X, ChevronDown, RefreshCw } from 'lucide-react';
import { when } from './operations-workspace';
import {
  initialChipEditorState, addLiteralChip, removeChip, setNote, toDraft, mailRuleStatusLabel, mailRuleStatusTone,
  describeChipAddRejection, shouldCommitChipOnKeyDown, MAX_LITERAL_CHARS,
} from './core/mail-rule-chip-editor.mjs';
import './operations-mail-rules.css';
type Row = Record<string, any>;

async function fetchJson(url: string, init?: RequestInit) {
  const response = await fetch(url, { cache: 'no-store', ...init });
  const body = await response.json().catch(() => null);
  return { ok: response.ok, status: response.status, body };
}

// One plain-Korean line per no-op reason `describeChipAddRejection` can return (S4).
const ADD_REJECTION_LABELS: Row = {
  empty: '빈 값은 추가할 수 없습니다.',
  too_long: `${MAX_LITERAL_CHARS}자를 넘을 수 없습니다.`,
  at_max: '더 추가할 수 없습니다(최대 개수 도달).',
  duplicate: '이미 있는 키워드입니다.',
};

// A preview/save/refresh failure's `state` maps to one plain-Korean line. `denied` carries a
// `reason` (one of this module's own structured error codes, e.g. `workspace_ledgers_note_missing`)
// that is shown verbatim as a fallback — better than a blank message, not meant to be pretty.
function writeRouteErrorMessage(status: number, body: Row | null, fallback: string): string {
  if (body?.state === 'write_disabled') return '쓰기가 꺼져 있어 실행할 수 없습니다.';
  if (body?.state === 'custody_unconfigured') return '메일 자료 연결이 설정되지 않아 실행할 수 없습니다.';
  if (body?.state === 'core_module_unavailable') return '핵심 모듈 연결 전이라 실행할 수 없습니다.';
  if (body?.state === 'workspaces_root_invalid') return '워크스페이스 경로를 찾을 수 없어 실행할 수 없습니다.';
  if (body?.state === 'workmeta_root_invalid') return '워크메타 경로를 찾을 수 없어 실행할 수 없습니다.';
  if (body?.state === 'busy') return '다른 요청을 처리 중입니다. 잠시 후 다시 시도하세요.';
  if (status === 413) return '요청이 너무 큽니다.';
  if (body?.reason) return `${fallback} (${body.reason})`;
  return fallback;
}

// S-b (second round): a refresh receipt with an empty `projects` array is not automatically an
// error (the adapter's directory-existence gate already rules out the "typo'd path" cause), but
// it is never nothing-to-report either — a real root that legitimately has zero onboarded
// projects still deserves a visible "found nothing" signal instead of reading identically to
// "everything is fine."
function refreshFoundNoProjects(refresh: Row | undefined): boolean {
  return Array.isArray(refresh?.projects) && refresh.projects.length === 0;
}

function ChipGroup({ label, chipState, group, editing, onRemove, onAdd, addPlaceholder }: {
  label: string; chipState: Row; group: 'exact' | 'hint'; editing: boolean;
  onRemove: (index: number) => void; onAdd?: (v: string) => void; addPlaceholder: string;
}) {
  const items: Row[] = chipState[group];
  const [draftValue, setDraftValue] = useState('');
  const [addError, setAddError] = useState<string | null>(null);

  // S4: on a no-op add (empty, too long, at max, duplicate) the typed text stays in the input
  // and the reason is shown, instead of silently clearing the field as if nothing happened.
  const attemptAdd = () => {
    if (!onAdd) return;
    const rejection = describeChipAddRejection(chipState, group, draftValue);
    if (rejection) { setAddError(rejection); return; }
    setAddError(null);
    onAdd(draftValue);
    setDraftValue('');
  };

  return <div className="mr-chip-group">
    <h3>{label} <span className="mr-count">{items.length}</span></h3>
    <div className="mr-chips">
      {items.map((item, index) => <span className="mr-chip" key={`${index}-${item.label}`}>
        {item.kind === 'regex' && <em className="mr-regex-tag">정규식</em>}
        <span>{item.label}</span>
        {editing && <button type="button" aria-label={`${item.label} 제거`} onClick={() => onRemove(index)}><X size={12} /></button>}
      </span>)}
      {!items.length && <span className="cx-muted">등록된 키워드가 없습니다.</span>}
    </div>
    {editing && onAdd && <div className="mr-chip-add">
      <input type="text" value={draftValue} maxLength={80} placeholder={addPlaceholder} aria-label={`${label} ${addPlaceholder}`}
        onChange={e => { setDraftValue(e.target.value); setAddError(null); }}
        onKeyDown={e => {
          if (!shouldCommitChipOnKeyDown({ key: e.key, isComposing: e.nativeEvent.isComposing, keyCode: e.nativeEvent.keyCode })) return;
          e.preventDefault();
          attemptAdd();
        }} />
      <button type="button" onClick={attemptAdd}>추가</button>
      {addError && <p className="cx-notice" aria-live="polite">{ADD_REJECTION_LABELS[addError] ?? addError}</p>}
    </div>}
  </div>;
}

const SAMPLE_GROUP_LABELS: Row = { moved_in: '새로 들어옴', moved_out: '빠짐', newly_held: '보류' };

// R4 (coordinator decision, fresh review round 4): previewRule now returns TWO views,
// never conflated -- "지금"/"바뀌면" (matched_before/matched_after) are what refresh()
// will actually write (every step: rule + table + reading + 본문), while "이
// 규칙으로"(rule_matched_after) is THIS rule's own subject terms alone, and "표·판독으로
// 추가"(table_attributed_after) is the gap between the two -- an Owner table (or step
// 4's 본문 tie-break) holding mail the rule itself no longer would. Both shown next to
// 지금/바뀌면 so trimming a term to zero visibly shows "이 규칙으로" drop to 0 while
// "바뀌면" can still stay above 0 if a table holds the rest -- exactly the gap the
// coordinator flagged (a rule matching 1 mail used to render "확정 3건" with no way to
// see that 2 of those came from a table).
function PreviewResult({ result }: { result: Row }) {
  const hasSplit = result.rule_matched_after !== undefined || result.table_attributed_after !== undefined;
  const rows: [string, any][] = [
    ['지금', result.matched_before], ['바뀌면', result.matched_after],
    ...(hasSplit ? ([
      ['이 규칙으로', result.rule_matched_after], ['표·판독으로 추가', result.table_attributed_after],
    ] as [string, any][]) : []),
    ['새로 들어옴', result.moved_in], ['빠짐', result.moved_out], ['보류', result.newly_held],
  ];
  // S2 (fresh review round 4): of "바뀌면", how many came from a recognised system
  // sender -- K2's own point is that this is informational only, never subtracted from
  // the counts above, so it renders as its own separate line, not folded into "바뀌면".
  const systemSenderCount = typeof result.matched_from_system_senders === 'number' ? result.matched_from_system_senders : null;
  // NIT (fresh review round 4): the adapter sends `tables_used: []` explicitly when
  // `orgConfigPath` was never configured (so no Owner table could possibly have been
  // consulted) -- shown as a plain, low-emphasis note rather than left for the Owner to
  // infer from the counts alone.
  const tablesNotApplied = Array.isArray(result.tables_used) && result.tables_used.length === 0;
  return <div className="mr-preview">
    {Array.isArray(result.rule_failures) && result.rule_failures.length > 0 && <p className="cx-notice">
      주의: 다른 과제 규칙 {result.rule_failures.length}건이 컴파일 실패해 이번 실측에서 제외됨(보류/양보 판단이 바뀔 수 있음).
    </p>}
    {/* S1 (fresh review round 4): owner_table_failures needs the exact same caveat
        treatment rule_failures already gets -- a measurement taken while a bundle/
        reading/vendor table failed to load is incomplete for the same reason. */}
    {Array.isArray(result.owner_table_failures) && result.owner_table_failures.length > 0 && <p className="cx-notice">
      주의: Owner 표 {result.owner_table_failures.length}개가 이번 실측에서 로드 실패해 제외됨(표·판독 귀속이 실제보다 적게 잡혔을 수 있음).
    </p>}
    <dl className="mr-preview-counts">{rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{typeof v === 'number' ? `${v.toLocaleString('ko-KR')}통` : '미확인'}</dd></div>)}</dl>
    {systemSenderCount !== null && <p className="cx-muted">그중 시스템발신: {systemSenderCount.toLocaleString('ko-KR')}통</p>}
    {tablesNotApplied && <p className="cx-muted">표 미적용</p>}
    {result.samples && <div className="mr-preview-samples">
      {Object.entries(result.samples).map(([group, items]) => Array.isArray(items) && items.length > 0 && <details key={group}>
        <summary>{SAMPLE_GROUP_LABELS[group] ?? group} 표본 {items.length}건 <ChevronDown size={12} /></summary>
        <ul>{(items as Row[]).map((item, i) => <li key={i}>{typeof item?.subject === 'string' ? item.subject : String(item)}</li>)}</ul>
      </details>)}
    </div>}
  </div>;
}

export function MailRulePanel({ project }: { project?: string }) {
  const [snapshot, setSnapshot] = useState<Row | null>(null);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [chipState, setChipState] = useState<Row | null>(null);
  const [previewResult, setPreviewResult] = useState<Row | null>(null);
  const [previewedKey, setPreviewedKey] = useState<string | null>(null);
  const [actionState, setActionState] = useState<'idle' | 'previewing' | 'saving' | 'retrying' | 'error'>('idle');
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [saveOutcome, setSaveOutcome] = useState<Row | null>(null);
  const [decisionsOpen, setDecisionsOpen] = useState(false);
  const [openItemsOpen, setOpenItemsOpen] = useState(false);

  const load = () => {
    if (!project) return;
    setLoading(true);
    fetchJson(`/mail-rule.snapshot.json?project=${encodeURIComponent(project)}`)
      .then(({ body }) => { setSnapshot(body ?? { state: 'unavailable' }); setEditing(false); setPreviewResult(null); setPreviewedKey(null); setConflict(false); })
      .catch(() => setSnapshot({ state: 'unavailable' }))
      .finally(() => setLoading(false));
  };
  useEffect(load, [project]);

  if (!project) return null;
  if (loading && !snapshot) return <section className="cx-card mr-panel"><header className="cx-section-heading"><div><h2>메일 분류 키워드</h2></div></header><p className="cx-muted">불러오는 중…</p></section>;
  if (!snapshot || snapshot.state === 'unconfigured') return <section className="cx-card mr-panel"><header className="cx-section-heading"><div><h2>메일 분류 키워드</h2></div></header><p className="cx-muted">이 화면에 연결된 프로젝트 저장 공간이 없습니다.</p></section>;
  if (snapshot.state === 'unavailable') return <section className="cx-card mr-panel"><header className="cx-section-heading"><div><h2>메일 분류 키워드</h2><p>{project}</p></div><button onClick={load}><RefreshCw size={14} />다시 확인</button></header><p className="cx-notice">규칙을 읽지 못했습니다{snapshot.reason ? ` (${snapshot.reason})` : ''}.</p></section>;
  if (snapshot.state === 'denied') return <section className="cx-card mr-panel"><header className="cx-section-heading"><div><h2>메일 분류 키워드</h2></div></header><p className="cx-notice">과제 코드가 올바르지 않습니다.</p></section>;
  if (snapshot.state === 'no_rule') return <section className="cx-card mr-panel"><header className="cx-section-heading"><div><h2>메일 분류 키워드</h2><p>{project}</p></div></header><p className="cx-muted">이 과제에는 아직 등록된 메일 분류 규칙이 없습니다.</p></section>;

  const rule = snapshot.rule as Row;
  const writeEnabled = Boolean(snapshot.write_enabled);
  const editDisabledReason = !writeEnabled ? '쓰기 꺼짐' : null;

  const draftKey = (state: Row | null) => state ? JSON.stringify({ exact: state.exact, hint: state.hint, yields_to: state.yields_to }) : null;
  const currentDraftKey = editing ? draftKey(chipState) : null;
  const previewIsFresh = previewedKey !== null && previewedKey === currentDraftKey;
  const notePresent = Boolean(chipState?.note && chipState.note.trim());
  const canSave = editing && previewIsFresh && notePresent;

  const beginEdit = () => { setChipState(initialChipEditorState(rule)); setPreviewResult(null); setPreviewedKey(null); setActionMessage(null); setActionState('idle'); setConflict(false); setSaveOutcome(null); setEditing(true); };
  const cancelEdit = () => { setEditing(false); setChipState(null); setPreviewResult(null); setPreviewedKey(null); setConflict(false); };

  const runPreview = () => {
    if (!chipState) return;
    setActionState('previewing'); setActionMessage(null); setConflict(false);
    const key = draftKey(chipState);
    fetchJson('/mail-rule/preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ project, draft: toDraft(chipState) }) })
      .then(({ ok, status, body }) => {
        if (ok && body?.state === 'ready') { setPreviewResult(body.result); setPreviewedKey(key); setActionState('idle'); return; }
        setActionState('error');
        setActionMessage(writeRouteErrorMessage(status, body, '미리보기를 실행하지 못했습니다.'));
      })
      .catch(() => { setActionState('error'); setActionMessage('미리보기를 실행하지 못했습니다.'); });
  };
  const runSave = () => {
    if (!chipState || !canSave) return;
    setActionState('saving'); setActionMessage(null); setConflict(false);
    // S1 optimistic concurrency: the panel sends back exactly the rule_version/sha256_json it
    // loaded (from the GET snapshot); the server refuses 409 rule_changed if either no longer
    // matches a fresh read, rather than silently overwriting someone else's more recent save.
    const body = JSON.stringify({ project, draft: toDraft(chipState), rule_version: rule.rule_version, sha256_json: snapshot.sha256_json });
    fetchJson('/mail-rule/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })
      .then(({ ok, status, body: resBody }) => {
        if (ok && resBody?.state === 'saved') {
          setSaveOutcome({ kind: 'saved', previousVersion: resBody.previous_version, ruleVersion: resBody.rule_version,
            changedFiles: resBody.refresh?.changed_files, foundNoProjects: refreshFoundNoProjects(resBody.refresh) });
          setActionState('idle'); setEditing(false); load(); return;
        }
        if (ok && resBody?.state === 'saved_refresh_failed') {
          setSaveOutcome({ kind: 'saved_refresh_failed', ruleVersion: resBody.rule_version, errorCode: resBody.error_code });
          setActionState('idle'); setEditing(false); load(); return;
        }
        if (ok && resBody?.state === 'saved_refresh_partial') {
          setSaveOutcome({ kind: 'saved_refresh_partial', ruleVersion: resBody.rule_version, previousVersion: resBody.previous_version,
            ledgerFailures: resBody.refresh?.ledger_failures, ruleFailures: resBody.refresh?.rule_failures, unreadableDirs: resBody.refresh?.unreadable_dirs });
          setActionState('idle'); setEditing(false); load(); return;
        }
        if (status === 409 && resBody?.state === 'rule_changed') {
          // nit (second round): a reload here used to call `load()`, which resets `editing` and
          // wipes `chipState` — silently discarding whatever the Owner had typed at exactly the
          // moment they most need it kept. The reload button below instead only refreshes
          // `snapshot` (so `rule.rule_version`/`snapshot.sha256_json` are current for a retry);
          // the Owner's chips, note, and preview result are left exactly as they were.
          setActionState('error'); setConflict(true);
          setActionMessage('다른 곳에서 이 규칙이 먼저 바뀌었습니다. 아래에서 새로 불러온 뒤(입력한 내용은 유지됩니다) 다시 저장하세요.');
          return;
        }
        setActionState('error');
        setActionMessage(writeRouteErrorMessage(status, resBody, '저장하지 못했습니다.'));
      })
      .catch(() => { setActionState('error'); setActionMessage('저장하지 못했습니다.'); });
  };
  // The "다시 불러오기" reload after a 409 rule_changed conflict. Unlike `load()`, this never
  // touches `editing`/`chipState`/`previewResult` — only `snapshot` (and therefore `rule` and
  // `snapshot.sha256_json`, what the next save attempt will be checked against) is refreshed, so
  // the Owner's typed chips and note stay exactly as they were and can simply be saved again.
  const reloadKeepingDraft = () => {
    if (!project) return;
    fetchJson(`/mail-rule.snapshot.json?project=${encodeURIComponent(project)}`)
      .then(({ body }) => { if (body?.state === 'ready') setSnapshot(body); })
      .catch(() => {})
      .finally(() => { setConflict(false); setActionMessage(null); setActionState('idle'); });
  };
  const runRefreshRetry = () => {
    setActionState('retrying'); setActionMessage(null);
    fetchJson('/mail-rule/refresh', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      .then(({ ok, status, body }) => {
        if (ok && (body?.state === 'ready' || body?.state === 'refresh_partial')) {
          setSaveOutcome((prev: Row | null) => {
            if (!prev) return null;
            if (body.state === 'ready') return { kind: 'saved', previousVersion: prev.previousVersion, ruleVersion: prev.ruleVersion,
              changedFiles: body.refresh?.changed_files, foundNoProjects: refreshFoundNoProjects(body.refresh) };
            return { kind: 'saved_refresh_partial', ruleVersion: prev.ruleVersion, previousVersion: prev.previousVersion,
              ledgerFailures: body.refresh?.ledger_failures, ruleFailures: body.refresh?.rule_failures, unreadableDirs: body.refresh?.unreadable_dirs };
          });
          setActionState('idle'); return;
        }
        setActionState('error');
        setActionMessage(writeRouteErrorMessage(status, body, '장부 갱신을 다시 실행하지 못했습니다.'));
      })
      .catch(() => { setActionState('error'); setActionMessage('장부 갱신을 다시 실행하지 못했습니다.'); });
  };

  const exactItems = editing && chipState ? chipState.exact : rule.exact;
  const hintItems = editing && chipState ? chipState.hint : rule.hint;
  const busy = actionState === 'previewing' || actionState === 'saving' || actionState === 'retrying';

  return <section className="cx-card mr-panel" aria-label="메일 분류 키워드">
    <header className="cx-section-heading">
      <div><h2>메일 분류 키워드</h2><p>{project} · 판본 {rule.rule_version}</p></div>
      <span className={`cx-status is-${mailRuleStatusTone(rule.status)}`}>{mailRuleStatusLabel(rule.status)}</span>
      {!editing && <button onClick={beginEdit} disabled={!!editDisabledReason} title={editDisabledReason ?? undefined}><Tag size={14} />편집</button>}
    </header>

    <div aria-live="polite">
      {saveOutcome?.kind === 'saved' && (saveOutcome.foundNoProjects
        ? <p className="mr-save-outcome is-warning">v{saveOutcome.previousVersion} → v{saveOutcome.ruleVersion} 저장됨, 그러나 과제를 찾지 못했습니다(장부 갱신 대상 0개) — 워크스페이스·워크메타 경로 설정을 확인하세요.</p>
        : <p className="mr-save-outcome">v{saveOutcome.previousVersion} → v{saveOutcome.ruleVersion} 저장됨, 장부 갱신 {saveOutcome.changedFiles ?? 0}개 파일</p>)}
      {saveOutcome?.kind === 'saved_refresh_failed' && <p className="mr-save-outcome is-warning">규칙은 저장됨(v{saveOutcome.ruleVersion}), 장부 갱신 실패 — <button onClick={runRefreshRetry} disabled={busy}>다시 시도</button></p>}
      {saveOutcome?.kind === 'saved_refresh_partial' && <p className="mr-save-outcome is-warning">
        규칙은 저장됨(v{saveOutcome.previousVersion} → v{saveOutcome.ruleVersion}), 장부 갱신 일부 실패
        (규칙 실패 {saveOutcome.ruleFailures ?? 0}건 · 읽기 실패 폴더 {saveOutcome.unreadableDirs ?? 0}건 · 장부 검증 실패 {saveOutcome.ledgerFailures ?? 0}건)
        — <button onClick={runRefreshRetry} disabled={busy}>다시 시도</button>
      </p>}
    </div>

    {/* nit (second round): keyed on `editing` so ChipGroup's own local draftValue/addError state
        (not lifted here — it belongs to the in-progress add attempt, not the chip list) resets
        on every edit-mode transition, instead of a cancelled or completed edit leaving stale
        typed text or an old rejection message sitting in the input the next time editing starts. */}
    <ChipGroup key={`exact-${editing}`} label="확정 키워드" chipState={editing && chipState ? chipState : { exact: exactItems, hint: hintItems }} group="exact" editing={editing} addPlaceholder="새 키워드"
      onRemove={index => setChipState((s: Row) => removeChip(s, 'exact', index))}
      onAdd={value => setChipState((s: Row) => addLiteralChip(s, 'exact', value))} />
    <ChipGroup key={`hint-${editing}`} label="검토 힌트" chipState={editing && chipState ? chipState : { exact: exactItems, hint: hintItems }} group="hint" editing={editing} addPlaceholder="새 힌트"
      onRemove={index => setChipState((s: Row) => removeChip(s, 'hint', index))}
      onAdd={value => setChipState((s: Row) => addLiteralChip(s, 'hint', value))} />

    {(rule.yields_to ?? []).map((y: Row, i: number) => <p className="cx-footnote" key={`${y.project_code}-${i}`}>
      같은 메일에 {y.when?.label}이 있으면 이 과제가 아니라 {y.project_code}로 본다
    </p>)}

    <details open={decisionsOpen} onToggle={e => setDecisionsOpen((e.target as HTMLDetailsElement).open)}>
      <summary>Owner 확인 기록 <ChevronDown size={13} /></summary>
      {snapshot.decisions?.length ? <ul className="mr-note-list">{snapshot.decisions.map((d: string, i: number) => <li key={i}>{d}</li>)}</ul> : <p className="cx-muted">기록 없음</p>}
    </details>
    <details open={openItemsOpen} onToggle={e => setOpenItemsOpen((e.target as HTMLDetailsElement).open)}>
      <summary>Owner 확인이 필요한 것 <ChevronDown size={13} /></summary>
      {snapshot.open_items?.length ? <ul className="mr-note-list">{snapshot.open_items.map((d: string, i: number) => <li key={i}>{d}</li>)}</ul> : <p className="cx-muted">없음</p>}
    </details>

    {editing && <div className="mr-edit-controls">
      <label className="mr-note-field">사유 (저장 전 필수)<textarea maxLength={500} value={chipState?.note ?? ''} onChange={e => setChipState((s: Row) => setNote(s, e.target.value))} /></label>
      <div className="mr-edit-actions">
        <button onClick={runPreview} disabled={busy || !!editDisabledReason} title={editDisabledReason ?? undefined}>미리보기</button>
        <button className="cx-primary" onClick={runSave} disabled={busy || !canSave || !!editDisabledReason}
          title={editDisabledReason ?? (!canSave ? '변경한 초안으로 미리보기를 먼저 실행하고, 사유를 입력하세요.' : undefined)}>새 판으로 저장</button>
        <button onClick={cancelEdit} disabled={busy}>취소</button>
      </div>
      {editDisabledReason && <p className="cx-notice">{editDisabledReason}</p>}
      {!editDisabledReason && !canSave && <p className="cx-footnote">현재 초안으로 미리보기를 실행하고 사유를 입력해야 저장할 수 있습니다.</p>}
      <p className="cx-footnote" aria-live="polite">
        {actionMessage && <span className={actionState === 'error' ? 'cx-notice' : 'cx-footnote'}>{actionMessage}</span>}
        {conflict && <button onClick={reloadKeepingDraft} disabled={busy} style={{ marginLeft: '0.5em' }}>다시 불러오기</button>}
      </p>
      {previewResult && <div className={previewIsFresh ? undefined : 'mr-preview-stale'}>
        {!previewIsFresh && <p className="cx-footnote">초안이 바뀌어 이 결과는 오래되었습니다. 다시 미리보기하세요.</p>}
        <PreviewResult result={previewResult} />
      </div>}
    </div>}
    <p className="cx-footnote">확인 {when(snapshot.observed_at)}</p>
  </section>;
}

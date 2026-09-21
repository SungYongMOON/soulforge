import { useEffect, useState } from 'react';
import { Tag, X, ChevronDown, RefreshCw } from 'lucide-react';
import { when } from './operations-workspace';
import { initialChipEditorState, addLiteralChip, removeChip, setNote, toDraft, mailRuleStatusLabel, mailRuleStatusTone } from './core/mail-rule-chip-editor.mjs';
import './operations-mail-rules.css';
type Row = Record<string, any>;

async function fetchJson(url: string, init?: RequestInit) {
  const response = await fetch(url, { cache: 'no-store', ...init });
  const body = await response.json().catch(() => null);
  return { ok: response.ok, status: response.status, body };
}

// A preview/save/refresh failure's `state` maps to one plain-Korean line. `denied` carries a
// `reason` (one of this module's own structured error codes, e.g. `workspace_ledgers_note_missing`)
// that is shown verbatim as a fallback — better than a blank message, not meant to be pretty.
function writeRouteErrorMessage(status: number, body: Row | null, fallback: string): string {
  if (body?.state === 'write_disabled') return '쓰기가 꺼져 있어 실행할 수 없습니다.';
  if (body?.state === 'custody_unconfigured') return '메일 자료 연결이 설정되지 않아 실행할 수 없습니다.';
  if (body?.state === 'core_module_unavailable') return '핵심 모듈 연결 전이라 실행할 수 없습니다.';
  if (status === 413) return '요청이 너무 큽니다.';
  if (body?.reason) return `${fallback} (${body.reason})`;
  return fallback;
}

function ChipGroup({ label, items, editing, onRemove, onAdd, addPlaceholder }: {
  label: string; items: Row[]; editing: boolean; onRemove: (l: string) => void; onAdd?: (v: string) => void; addPlaceholder: string;
}) {
  const [draftValue, setDraftValue] = useState('');
  return <div className="mr-chip-group">
    <h3>{label} <span className="mr-count">{items.length}</span></h3>
    <div className="mr-chips">
      {items.map(item => <span className="mr-chip" key={item.label}>
        {item.kind === 'regex' && <em className="mr-regex-tag">정규식</em>}
        <span>{item.label}</span>
        {editing && <button type="button" aria-label={`${item.label} 제거`} onClick={() => onRemove(item.label)}><X size={12} /></button>}
      </span>)}
      {!items.length && <span className="cx-muted">등록된 키워드가 없습니다.</span>}
    </div>
    {editing && onAdd && <div className="mr-chip-add">
      <input type="text" value={draftValue} maxLength={80} placeholder={addPlaceholder}
        onChange={e => setDraftValue(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); onAdd(draftValue); setDraftValue(''); } }} />
      <button type="button" onClick={() => { onAdd(draftValue); setDraftValue(''); }}>추가</button>
    </div>}
  </div>;
}

const SAMPLE_GROUP_LABELS: Row = { moved_in: '새로 들어옴', moved_out: '빠짐', newly_held: '보류' };

function PreviewResult({ result }: { result: Row }) {
  const rows: [string, any][] = [
    ['지금', result.matched_before], ['바뀌면', result.matched_after], ['새로 들어옴', result.moved_in],
    ['빠짐', result.moved_out], ['보류', result.newly_held],
  ];
  return <div className="mr-preview">
    <dl className="mr-preview-counts">{rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{typeof v === 'number' ? `${v.toLocaleString('ko-KR')}통` : '미확인'}</dd></div>)}</dl>
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
  const [saveOutcome, setSaveOutcome] = useState<Row | null>(null);
  const [decisionsOpen, setDecisionsOpen] = useState(false);
  const [openItemsOpen, setOpenItemsOpen] = useState(false);

  const load = () => {
    if (!project) return;
    setLoading(true);
    fetchJson(`/mail-rule.snapshot.json?project=${encodeURIComponent(project)}`)
      .then(({ body }) => { setSnapshot(body ?? { state: 'unavailable' }); setEditing(false); setPreviewResult(null); setPreviewedKey(null); })
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
  const notePresent = Boolean(chipState?.note && chipState.note.trim());
  const canSave = editing && previewedKey !== null && previewedKey === currentDraftKey && notePresent;

  const beginEdit = () => { setChipState(initialChipEditorState(rule)); setPreviewResult(null); setPreviewedKey(null); setActionMessage(null); setActionState('idle'); setSaveOutcome(null); setEditing(true); };
  const cancelEdit = () => { setEditing(false); setChipState(null); setPreviewResult(null); setPreviewedKey(null); };

  const runPreview = () => {
    if (!chipState) return;
    setActionState('previewing'); setActionMessage(null);
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
    setActionState('saving'); setActionMessage(null);
    fetchJson('/mail-rule/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ project, draft: toDraft(chipState) }) })
      .then(({ ok, status, body }) => {
        if (ok && body?.state === 'saved') {
          setSaveOutcome({ kind: 'saved', previousVersion: body.previous_version, ruleVersion: body.rule_version, changedFiles: body.refresh?.changed_files });
          setActionState('idle'); setEditing(false); load(); return;
        }
        if (ok && body?.state === 'saved_refresh_failed') {
          setSaveOutcome({ kind: 'saved_refresh_failed', ruleVersion: body.rule_version, errorCode: body.error_code });
          setActionState('idle'); setEditing(false); load(); return;
        }
        setActionState('error');
        setActionMessage(writeRouteErrorMessage(status, body, '저장하지 못했습니다.'));
      })
      .catch(() => { setActionState('error'); setActionMessage('저장하지 못했습니다.'); });
  };
  const runRefreshRetry = () => {
    setActionState('retrying'); setActionMessage(null);
    fetchJson('/mail-rule/refresh', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      .then(({ ok, status, body }) => {
        if (ok && body?.state === 'ready') {
          setSaveOutcome((prev: Row | null) => prev ? { kind: 'saved', previousVersion: prev.previousVersion, ruleVersion: prev.ruleVersion, changedFiles: body.refresh?.changed_files } : null);
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

    {saveOutcome?.kind === 'saved' && <p className="mr-save-outcome">v{saveOutcome.previousVersion} → v{saveOutcome.ruleVersion} 저장됨, 장부 갱신 {saveOutcome.changedFiles ?? 0}개 파일</p>}
    {saveOutcome?.kind === 'saved_refresh_failed' && <p className="mr-save-outcome is-warning">규칙은 저장됨(v{saveOutcome.ruleVersion}), 장부 갱신 실패 — <button onClick={runRefreshRetry} disabled={busy}>다시 시도</button></p>}

    <ChipGroup label="확정 키워드" items={exactItems} editing={editing} addPlaceholder="새 키워드"
      onRemove={label => setChipState((s: Row) => removeChip(s, 'exact', label))}
      onAdd={value => setChipState((s: Row) => addLiteralChip(s, 'exact', value))} />
    <ChipGroup label="검토 힌트" items={hintItems} editing={editing} addPlaceholder="새 힌트"
      onRemove={label => setChipState((s: Row) => removeChip(s, 'hint', label))}
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
      {actionMessage && <p className={actionState === 'error' ? 'cx-notice' : 'cx-footnote'}>{actionMessage}</p>}
      {previewResult && <PreviewResult result={previewResult} />}
    </div>}
    <p className="cx-footnote">확인 {when(snapshot.observed_at)}</p>
  </section>;
}

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

function PreviewResult({ result }: { result: Row }) {
  const rows: [string, any][] = [
    ['지금', result.matched_before], ['바뀌면', result.matched_after], ['새로 들어옴', result.moved_in],
    ['빠짐', result.moved_out], ['보류', result.newly_held],
  ];
  return <div className="mr-preview">
    <dl className="mr-preview-counts">{rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{typeof v === 'number' ? `${v.toLocaleString('ko-KR')}통` : '미확인'}</dd></div>)}</dl>
    {result.samples && <div className="mr-preview-samples">
      {Object.entries(result.samples).map(([group, titles]) => Array.isArray(titles) && titles.length > 0 && <div key={group}>
        <h4>{group}</h4>
        <ul>{(titles as string[]).slice(0, 10).map((title, i) => <li key={i}>{title}</li>)}</ul>
      </div>)}
    </div>}
  </div>;
}

export function MailRulePanel({ project }: { project?: string }) {
  const [snapshot, setSnapshot] = useState<Row | null>(null);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [chipState, setChipState] = useState<Row | null>(null);
  const [previewResult, setPreviewResult] = useState<Row | null>(null);
  const [actionState, setActionState] = useState<'idle' | 'previewing' | 'saving' | 'error'>('idle');
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [decisionsOpen, setDecisionsOpen] = useState(false);
  const [openItemsOpen, setOpenItemsOpen] = useState(false);

  const load = () => {
    if (!project) return;
    setLoading(true);
    fetchJson(`/mail-rule.snapshot.json?project=${encodeURIComponent(project)}`)
      .then(({ body }) => { setSnapshot(body ?? { state: 'unavailable' }); setEditing(false); setPreviewResult(null); })
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

  const beginEdit = () => { setChipState(initialChipEditorState(rule)); setPreviewResult(null); setActionMessage(null); setActionState('idle'); setEditing(true); };
  const cancelEdit = () => { setEditing(false); setChipState(null); setPreviewResult(null); };

  const runPreview = () => {
    if (!chipState) return;
    setActionState('previewing'); setActionMessage(null);
    fetchJson('/mail-rule/preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ project, draft: toDraft(chipState) }) })
      .then(({ ok, status, body }) => {
        if (ok && body?.state === 'ready') { setPreviewResult(body.result); setActionState('idle'); return; }
        setActionState('error');
        setActionMessage(status === 503 ? '핵심 모듈 연결 전이라 미리보기를 실행할 수 없습니다.' : '미리보기를 실행하지 못했습니다.');
      })
      .catch(() => { setActionState('error'); setActionMessage('미리보기를 실행하지 못했습니다.'); });
  };
  const runSave = () => {
    if (!chipState) return;
    setActionState('saving'); setActionMessage(null);
    fetchJson('/mail-rule/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ project, draft: toDraft(chipState) }) })
      .then(({ ok, status, body }) => {
        if (ok && body?.state === 'ready') { setActionMessage('새 판으로 저장되었습니다.'); setActionState('idle'); setEditing(false); load(); return; }
        setActionState('error');
        setActionMessage(status === 403 ? '쓰기가 꺼져 있어 저장할 수 없습니다.' : status === 503 ? '핵심 모듈 연결 전이라 저장할 수 없습니다.' : '저장하지 못했습니다.');
      })
      .catch(() => { setActionState('error'); setActionMessage('저장하지 못했습니다.'); });
  };

  const exactItems = editing && chipState ? chipState.exact : rule.exact;
  const hintItems = editing && chipState ? chipState.hint : rule.hint;

  return <section className="cx-card mr-panel" aria-label="메일 분류 키워드">
    <header className="cx-section-heading">
      <div><h2>메일 분류 키워드</h2><p>{project} · 판본 {rule.rule_version}</p></div>
      <span className={`cx-status is-${mailRuleStatusTone(rule.status)}`}>{mailRuleStatusLabel(rule.status)}</span>
      {!editing && <button onClick={beginEdit} disabled={!!editDisabledReason} title={editDisabledReason ?? undefined}><Tag size={14} />편집</button>}
    </header>

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
      <label className="mr-note-field">사유<textarea maxLength={500} value={chipState?.note ?? ''} onChange={e => setChipState((s: Row) => setNote(s, e.target.value))} /></label>
      <div className="mr-edit-actions">
        <button onClick={runPreview} disabled={actionState === 'previewing' || actionState === 'saving' || !!editDisabledReason} title={editDisabledReason ?? undefined}>미리보기</button>
        <button className="cx-primary" onClick={runSave} disabled={actionState === 'previewing' || actionState === 'saving' || !!editDisabledReason} title={editDisabledReason ?? undefined}>새 판으로 저장</button>
        <button onClick={cancelEdit}>취소</button>
      </div>
      {editDisabledReason && <p className="cx-notice">{editDisabledReason}</p>}
      {actionMessage && <p className={actionState === 'error' ? 'cx-notice' : 'cx-footnote'}>{actionMessage}</p>}
      {previewResult && <PreviewResult result={previewResult} />}
    </div>}
    <p className="cx-footnote">확인 {when(snapshot.observed_at)}</p>
  </section>;
}

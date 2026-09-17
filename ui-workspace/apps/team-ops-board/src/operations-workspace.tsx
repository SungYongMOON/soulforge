import { useProjectNames, ProjectText, ProjectLabel, ProjectNamesContext } from './project-labels';
import { projectLabel } from './core/project-label.mjs';
import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  ChevronDown,
  ChevronRight,
  FileText,
  FolderOpen,
  RefreshCw,
  Search,
  X,
  Calendar,
  Filter,
  Layers,
  ArrowUpDown
} from 'lucide-react';
import { buildClaudeQuotaPresentation, selectCodexRateLimitObservation } from './core/provider-limits.mjs';
import { antigravityQuotaRows } from './core/antigravity-quota.mjs';
import { formatAmount, formatExact } from './core/operations-format.mjs';
import {
  sanitizeSlackMentions,
  cleanHumanText,
  extractDatesFromEvidence,
  calculateTruthfulRankReason,
  extractMatchSnippet,
  splitTextForHighlight,
  dedupeEvidence,
  filterAndSortEvidence,
  filterLoadedTreeEntries,filterLoadedTreeLevel,
  paginateSiblings
} from './core/operations-workspace-helpers.mjs';
import './operations-workspace.css';

export { ProjectLabel, ProjectText };

type Row = Record<string, any>;
const sourceLabel=(key:string)=>({voice:'PLAUD·음성',slack:'Slack',linear:'Linear',mail:'메일',document:'문서',docs:'문서',buzz:'Buzz'} as Row)[key]??key;

export const when = (v: any) =>
  v && Number.isFinite(Date.parse(v))
    ? new Date(v).toLocaleString('ko-KR', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      })
    : '미확인';

const size = (v: any) =>
  typeof v === 'number'
    ? v < 1024
      ? `${v} B`
      : `${(v / 1024).toLocaleString('ko-KR', { maximumFractionDigits: 1 })} KB`
    : '—';

export async function localRead(url: string) {
  const r = await fetch(url, {
    credentials: 'omit',
    cache: 'no-store',
    redirect: 'error',
    signal: AbortSignal.timeout(45000)
  });
  if (!r.ok || !r.headers.get('content-type')?.includes('application/json')) throw Error('read');
  return r.json();
}

const route = (kind: string, args: Row) => `/operations-${kind}.json?${new URLSearchParams(args)}`;

export function Allowance({ inputs, failed = [] }: { inputs: Row; failed?: string[] }) {
  const limits = inputs.limits,
    codex = limits?.codex,
    claude = buildClaudeQuotaPresentation(limits),
    now = Date.now();
  const fresh = (at: any) =>
    Number.isFinite(Date.parse(at)) && now - Date.parse(at) >= 0 && now - Date.parse(at) < 10 * 60000;
  const rows: Row[] = ['primary', 'secondary'].map(key => {
    const live = codex?.[key] ? { ...codex[key], observed_at: codex.observed_at } : null,
      meter = inputs.usage?.history?.rate_limit;
    const candidate =
      meter?.window_minutes === (live?.window_minutes ?? (key === 'primary' ? 300 : 10080))
        ? meter
        : null;
    const w = selectCodexRateLimitObservation({
        meter: failed.includes('usage') ? null : candidate,
        live: failed.includes('limits') ? null : live
      }),
      reset = w?.resets_at_epoch_s ? new Date(w.resets_at_epoch_s * 1000).toISOString() : null;
    return {
      id: `codex-${key}`,
      provider: 'Codex',
      window:
        w?.window_minutes === 300
          ? '5시간'
          : w?.window_minutes === 10080
          ? '주간'
          : w?.window_minutes
          ? `${w.window_minutes}분`
          : key === 'primary'
          ? '단기 창'
          : '장기 창',
      remaining:
        typeof w?.used_percent === 'number' && w.used_percent >= 0 && w.used_percent <= 100
          ? 100 - w.used_percent
          : null,
      reset,
      at: w?.observed_at,
      current: fresh(w?.observed_at) && Date.parse(reset ?? '') > now
    };
  });
  for (const [key, label] of [
    ['five_hour', '5시간'],
    ['seven_day', '주간']
  ]) {
    const w = (claude.claude as Row)[key];
    rows.push({
      id: `claude-${key}`,
      provider: 'Claude',
      window: label,
      remaining: typeof w?.utilization === 'number' ? 100 - w.utilization : null,
      reset: w?.resets_at,
      at: claude.claude.observed_at,
      current:
        !failed.includes('limits') &&
        claude.current &&
        fresh(claude.claude.observed_at) &&
        Date.parse(w?.resets_at) > now
    });
  }
  for (const [i, r] of antigravityQuotaRows(inputs.agQuota?.snapshot ?? inputs.agQuota).entries())
    rows.push({
      id: `ag-${i}`,
      provider: r.provider,
      window: r.window,
      remaining: r.remaining_percent,
      reset: r.resets_at,
      at: r.observed_at,
      current:
        !failed.includes('agQuota') &&
        r.freshness === 'current' &&
        fresh(r.observed_at) &&
        Date.parse(r.resets_at ?? '') > now
    });
  return (
    <section className="cx-card ow-allowance">
      <header className="cx-section-heading">
        <div>
          <h2>남은 한도</h2>
          <p>계정별 남은 사용 한도 · 사용한 토큰 합계와 별도입니다.</p>
        </div>
      </header>
      <div className="ow-quota-grid">
        {rows.slice(0, 4).map(r => (
          <div className="ow-quota" key={r.id}>
            <span>
              {r.provider} <small>{r.window}</small>
            </span>
            <strong>
              {r.current && r.remaining !== null ? `${Math.round(r.remaining)}%` : '미확인'}
              <small>남음</small>
            </strong>
            <div
              className="ow-meter"
              aria-label={`${r.provider} ${r.window} ${
                r.current ? r.remaining + '% 남음' : '현재 한도 미확인'
              }`}
            >
              <span style={{ width: r.current ? `${r.remaining ?? 0}%` : '0%' }} />
            </div>
            <p>{r.current ? '초기화' : '마지막 초기화 예정'} {when(r.reset)}</p>
            <small>
              {r.current ? '관측' : '이전 관측'} {when(r.at)}
              {!r.current && r.remaining !== null ? ` · 당시 ${Math.round(r.remaining)}% 남음` : ''}
            </small>
          </div>
        ))}
      </div>
      {rows.length > 4 && (
        <details className="ow-secondary-quota">
          <summary>Antigravity · {rows.length - 4}개 한도 창 보기</summary>
          {rows.slice(4).map(r => (
            <p key={r.id}>
              <strong>
                {r.provider} {r.window}
              </strong>{' '}
              · {r.current ? `${r.remaining}% 남음` : `현재 미확인 · 당시 ${r.remaining ?? '미확인'}%`}{' '}
              · 초기화 {when(r.reset)} · 관측 {when(r.at)}
            </p>
          ))}
        </details>
      )}
      <p className="cx-footnote">
        새 관측이 없거나 초기화 예정 시각이 지난 값은 현재 잔량으로 표시하지 않습니다. 남은 토큰 개수는
        제공자에서 제공하지 않습니다.
      </p>
    </section>
  );
}

export function WorkAndArrivals({
  inputs,
  failed,
  go
}: {
  inputs: Row;
  failed: string[];
  go: (n: any) => void;
}) {
  const runtime = inputs.runtime,
    bots: Row[] = runtime?.bots ?? [],
    threads: Row[] = inputs.threads?.threads ?? [];
  const current = runtime?.refresh_state === 'ready' && !failed.includes('runtime');
  const active = bots.filter(
    b => current && b.state?.kind !== 'unknown' && ['working', 'starting', 'waiting'].includes(b.state?.value)
  );
  const validThreads = inputs.threads?.adapter?.health === 'ready' && !failed.includes('threads');
  const running = validThreads
    ? threads.filter(
        t => t.observed === true && ['running', 'working', 'waiting_for_user', 'waiting_for_approval'].includes(t.status)
      )
    : [];
  return (
    <>
      <div className="ow-two">
        <section className="cx-card">
          <header className="cx-section-heading">
            <div>
              <h2>에이전트 활동</h2>
              <p>실행 관측이 있는 작업만 활동으로 표시합니다.</p>
            </div>
          </header>
          {active.length || running.length ? (
            <>
              {active.map(b => (
                <div className="ow-work" key={b.bot_id}>
                  <strong>{b.display_label}</strong>
                  <span>{b.state.value}</span>
                  <small>
                    최근 활동 {when(b.heartbeat?.value)} · {b.model?.value ?? '모델 미확인'}
                  </small>
                </div>
              ))}
              {running.slice(0, 6).map(t => (
                <div className="ow-work" key={t.thread_id}>
                  <strong>{t.display_label}</strong>
                  <span>{t.status}</span>
                  <small>{when(t.updated_at)}</small>
                </div>
              ))}
            </>
          ) : (
            <div className="ow-empty">
              <strong>
                {current && validThreads
                  ? '현재 활동으로 관측된 작업이 없습니다.'
                  : '현재 활동 여부를 확인할 수 없습니다.'}
              </strong>
              <p>프로세스 존재나 등록된 이름만으로 작업 중이라고 판단하지 않습니다.</p>
            </div>
          )}
          <details>
            <summary>연결된 관측과 마지막 작업 기록</summary>
            {bots.map(b => (
              <p key={b.bot_id}>
                <strong>{b.display_label}</strong> ·{' '}
                {b.hold_code === 'GATEWAY_DISCONNECTED'
                  ? 'Hermes 연결 끊김'
                  : current
                  ? b.state?.value ?? '미확인'
                  : '현재 활동 미확인'}
              </p>
            ))}
            <p>맥락이·강도담의 세부 작업 단계: 전용 실행 기록 연결 미확인</p>
            <p>Codex 작업 관측: {validThreads ? '조회됨' : '최신 조회 불가 · 이전 기록'}</p>
            {threads.slice(0, 5).map(t => (
              <p key={t.thread_id}>
                {t.display_label}{' '}
                <small>
                  {when(t.updated_at)} · {t.status}
                </small>
              </p>
            ))}
          </details>
        </section>
        <section className="cx-card">
          <header className="cx-section-heading">
            <div>
              <h2>최근 들어온 자료</h2>
              <p>자료 도착과 RAG 반영은 따로 확인합니다.</p>
            </div>
            <button onClick={() => go({ screen: 'directory', node: null })}>
              공간 열기 <ArrowRight size={14} />
            </button>
          </header>
          {inputs.recent?.rows?.length ? (
            inputs.recent.rows.slice(0, 4).map((r: Row) => (
              <div className="ow-arrival" key={r.id}>
                <span className="ow-source">{r.source}</span>
                <div>
                  <strong>{r.date || '녹음'} · 녹음 자료</strong>
                  <small>
                    {r.status} · 등록 {when(r.at)}
                  </small>
                  <small>
                    전사 {r.segments ?? '미확인'}개 · 음성 조각 {r.chunks ?? '미확인'}개
                  </small>
                </div>
              </div>
            ))
          ) : (
            <p className="ow-empty">PLAUD 등록 원장을 읽지 못했습니다.</p>
          )}
          <p className="cx-footnote">
            {inputs.recent?.scope} · 기준 {when(inputs.recent?.observed_at)}
          </p>
          <button onClick={() => go({ screen: 'rag', node: null })}>
            Slack·메일·문서의 최근 처리 보기 <ArrowRight size={15} />
          </button>
        </section>
      </div>
    </>
  );
}

export function RecentRag({ go }: { go: (n: any) => void }) {
  const projectNames = useProjectNames();
  const [summary, setSummary] = useState<Row | null>(null),
    [project, setProject] = useState(''),
    [detail, setDetail] = useState<Row | null>(null),
    [error, setError] = useState('');
  useEffect(() => {
    let alive = true;
    void localRead('/rag-operations.json').then(
      d => {
        if (alive) {
          setSummary(d);
          setProject(d.projects?.[0]?.project ?? '');
          if (d.state !== 'ready') setError('현재 DB 대조를 확인하지 못했습니다.');
        }
      },
      () => {
        if (alive) setError('RAG 기록을 읽지 못했습니다.');
      }
    );
    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => {
    let alive = true;
    if (!project) return;
    setDetail(null);
    void localRead(`/rag-operations.json?project=${encodeURIComponent(project)}`).then(
      d => {
        if (alive) setDetail(d);
      },
      () => {
        if (alive) setDetail({ state: 'unavailable' });
      }
    );
    return () => {
      alive = false;
    };
  }, [project]);
  const names: Row = {
    slack: 'Slack',
    voice: 'PLAUD·음성',
    mail: '메일',
    document: 'DOC',
    linear: 'Linear',
    buzz: 'Buzz'
  };
  const groups: Row = {};
  for (const doc of detail?.documents ?? []) {
    if (!groups[doc.source]) groups[doc.source] = [];
    groups[doc.source].push(doc);
  }
  const current = summary?.projects?.find((p: Row) => p.project === project);
  return (
    <section className="cx-card">
      <header className="cx-section-heading">
        <div>
          <h2>검색 목록의 자료</h2>
          <p>
            {projectLabel(project, projectNames)} · DB 반영 {when(current?.database?.loaded_at)} ·{' '}
            {current?.comparison === 'counts_match'
              ? '현재 저장 처리 버전·DB 수량 일치'
              : '현재 DB 대조 확인 필요'}
          </p>
        </div>
        <select
          aria-label="최근 처리 자료 과제"
          value={project}
          onChange={e => setProject(e.target.value)}
        >
          {summary?.projects?.map((p: Row) => (
            <option key={p.project} value={p.project}>
              {projectLabel(p.project, { [p.project]: p.project_name })}
            </option>
          ))}
        </select>
      </header>
      {error && <p className="cx-notice">{error}</p>}
      {Object.entries(groups).map(([source, docs]: [string, any]) => (
        <div className="ow-arrival" key={source}>
          <span className="ow-source">{names[source] ?? source}</span>
          <div>
            <strong>
              {docs.length}개 문서 · 준비 확인{' '}
              {docs.filter((d: Row) => d.preparation === 'prepared').length}개
            </strong>
            {docs.slice(0, 2).map((d: Row) => (
              <small key={d.id}>
                {d.item} · {d.units ?? '미확인'}개 단위 · {d.origin ?? '처리 방식 미확인'}
              </small>
            ))}
          </div>
        </div>
      ))}
      {!detail && !error && <p>현재 처리 버전의 처리 기록을 읽는 중…</p>}
      {detail && (!detail.documents?.length || detail.state !== 'ready') && (
        <p>표시할 문서 근거가 없거나 읽지 못했습니다. 수집 0건으로 해석하지 않습니다.</p>
      )}
      <p className="cx-footnote">
        선택 과제의 현재 처리 버전 범위입니다. 문서별 도착 순서는 이 기록에 없으므로 최신순이라고 표시하지
        않습니다.
      </p>
      <button onClick={() => go({ screen: 'rag', node: null })}>
        전처리·임베딩·재처리 이력 확인 <ArrowRight size={15} />
      </button>
    </section>
  );
}

export function Preview({
  selection,
  close,
  standalone = false
}: {
  selection: Row;
  close: () => void;
  standalone?: boolean;
}) {
  const [data, setData] = useState<Row | null>(null),
    [error, setError] = useState('');
  useEffect(() => {
    if (standalone) return;
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [close, standalone]);
  useEffect(() => {
    let alive = true;
    setData(null);
    setError('');
    localRead(route('file', selection)).then(
      d => {
        if (alive) setData(d);
      },
      () => {
        if (alive) setError('파일 미리보기를 읽지 못했습니다.');
      }
    );
    return () => {
      alive = false;
    };
  }, [selection]);
  const [blob, setBlob] = useState('');
  useEffect(() => {
    if (!data?.base64) {
      setBlob('');
      return;
    }
    const bytes = Uint8Array.from(atob(data.base64), c => c.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: data.mime }));
    setBlob(url);
    return () => URL.revokeObjectURL(url);
  }, [data]);
  return (
    <aside className={`ow-preview ${standalone ? 'standalone' : ''}`} aria-label="파일 미리보기">
      <header>
        <div>
          <small>읽기 전용 미리보기</small>
          <h2>{selection.relative.split('/').at(-1)}</h2>
        </div>
        {!standalone && (
          <button onClick={close} aria-label="미리보기 닫기">
            <X size={20} />
          </button>
        )}
      </header>
      <div className="ow-preview-tools">
        <span>
          {size(data?.size)} · 조회 {when(data?.read_at)}
        </span>
        {!standalone && (
          <a
            target="_blank"
            rel="noopener noreferrer"
            href={`/operations-console.html?preview=1&${new URLSearchParams(selection)}`}
          >
            별도 창 <ArrowUpRight size={14} />
          </a>
        )}
      </div>
      {data?.note && <p className="cx-footnote">{data.note}</p>}
      <div className="ow-preview-body">
        {error ? (
          <p>{error}</p>
        ) : !data ? (
          <p>파일 읽는 중…</p>
        ) : data.state !== 'ready' ? (
          <p>{data.reason}</p>
        ) : data.kind === 'text' ? (
          <pre>{data.text}</pre>
        ) : data.kind === 'image' ? (
          <img src={blob} alt={data.name} />
        ) : (
          <p>표시 형식을 확인하지 못했습니다.</p>
        )}
      </div>
      {data?.sha256 && (
        <details>
          <summary>파일 식별 정보</summary>
          <small>{data.sha256}</small>
          <p>원문은 이 PC의 미리보기에만 표시됩니다.</p>
        </details>
      )}
    </aside>
  );
}

// Tree Item entry representation for visible flattening and roving focus
interface FlatTreeItem {
  relative: string;
  entry: Row;
  depth: number;
  parent: string;
}

export function SpacePanel({
  space,
  project,
  onFile
}: {
  space: Row;
  project: string;
  onFile: (r: Row) => void;
}) {
  const [cache, setCache] = useState<Record<string, Row>>({});
  const [open, setOpen] = useState<Set<string>>(new Set(['']));
  const [folded, setFolded] = useState(false);
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [folderErrors, setFolderErrors] = useState<Record<string, string>>({});
  const [selectedFolder, setSelectedFolder] = useState<string>('');
  const [selectedRelative, setSelectedRelative] = useState<string>('');
  const [focusedRelative, setFocusedRelative] = useState<string>('');
  const [filters, setFilters] = useState<{ nameQuery: string; startDate: string; endDate: string }>({
    nameQuery: '',
    startDate: '',
    endDate: ''
  });
  const [showFilters, setShowFilters] = useState(false);
  const [pageLimits, setPageLimits] = useState<Record<string, number>>({});
  const treeContainerRef = useRef<HTMLDivElement>(null);
  const epoch = useRef(0);

  // Lazy load relative folder. Retains last-good cache on reload.
  const load = useCallback(
    async (relative: string) => {
      const e = epoch.current;
      setPending(old => new Set(old).add(relative));
      setFolderErrors(old => {
        const next = { ...old };
        delete next[relative];
        return next;
      });
      try {
        const d = await localRead(route('spaces', { space: space.id, project, relative }));
        if(!['ready','partial'].includes(d?.state))throw Error('directory_unavailable');
        if (e === epoch.current) {
          setCache(old => ({ ...old, [relative]: d }));
        }
      } catch {
        if (e === epoch.current) {
          setFolderErrors(old => ({
            ...old,
            [relative]: '목록 읽기 실패 또는 연결 거부'
          }));
          // If no previous cache, register unavailable state
          setCache(old => {
            if (!old[relative]) {
              return { ...old, [relative]: { state: 'unavailable', reason: '목록을 읽지 못했습니다.' } };
            }
            return old; // Retain last-good directory results!
          });
        }
      } finally {
        if (e === epoch.current) {
          setPending(old => {
            const next = new Set(old);
            next.delete(relative);
            return next;
          });
        }
      }
    },
    [space.id, project]
  );

  // Reload when space or project changes
  useEffect(() => {
    epoch.current++;
    setCache({});
    setOpen(new Set(['']));
    setSelectedFolder('');
    setSelectedRelative('');
    setFocusedRelative('');
    setFolderErrors({});
    setPageLimits({});
    void load('');
    return () => {
      epoch.current++;
    };
  }, [space.id, project, load]);

  // Compute visible items in document order for roving tabindex and keyboard tree navigation
  const visibleItems = useMemo(() => {
    const items: FlatTreeItem[] = [];
    const visit = (parent: string, depth: number) => {
      const data = cache[parent];
      if (!data || !data.entries) return;
      const filtered = filterLoadedTreeLevel(cache,parent,filters);
      const limit = pageLimits[parent] || 50;
      const visibleSiblings = filtered.slice(0, limit);

      for (const entry of visibleSiblings) {
        const relative = [parent, entry.name].filter(Boolean).join('/');
        items.push({ relative, entry, depth, parent });
        if (entry.browsable && open.has(relative)) {
          visit(relative, depth + 1);
        }
      }
    };
    visit('', 0);
    return items;
  }, [cache, open, filters, pageLimits]);

  // Ensure focusedRelative has a valid fallback
  useEffect(() => {
    if (visibleItems.length > 0 && (!focusedRelative || !visibleItems.some(i => i.relative === focusedRelative))) {
      setFocusedRelative(visibleItems[0].relative);
    }
  }, [visibleItems, focusedRelative]);
  useEffect(()=>{
    const root=treeContainerRef.current;
    if(!root?.contains(document.activeElement))return;
    [...root.querySelectorAll<HTMLElement>('[role="treeitem"]')].find(el=>el.dataset.path===focusedRelative)?.focus();
  },[focusedRelative,visibleItems]);

  // Toggle folder expand/collapse
  const toggleFolder = useCallback(
    (relative: string) => {
      const isExpanded = open.has(relative);
      setOpen(old => {
        const next = new Set(old);
        if (isExpanded) {
          next.delete(relative);
        } else {
          next.add(relative);
        }
        return next;
      });
      setSelectedFolder(relative);
      setSelectedRelative(relative);
      setFocusedRelative(relative);
      if (!isExpanded && !cache[relative]) {
        void load(relative);
      }
    },
    [open, cache, load]
  );

  // Tree keyboard navigation according to WAI-ARIA Treeview pattern
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if((e.target as HTMLElement).closest('button,input,select,summary'))return;
      if (!visibleItems.length) return;
      const currentIndex = visibleItems.findIndex(i => i.relative === focusedRelative);
      const currentItem = currentIndex >= 0 ? visibleItems[currentIndex] : visibleItems[0];

      switch (e.key) {
        case 'ArrowDown': {
          e.preventDefault();
          const nextIndex = Math.min(visibleItems.length - 1, (currentIndex >= 0 ? currentIndex : 0) + 1);
          setFocusedRelative(visibleItems[nextIndex].relative);
          break;
        }
        case 'ArrowUp': {
          e.preventDefault();
          const prevIndex = Math.max(0, (currentIndex >= 0 ? currentIndex : 1) - 1);
          setFocusedRelative(visibleItems[prevIndex].relative);
          break;
        }
        case 'ArrowRight': {
          e.preventDefault();
          if (currentItem.entry.browsable) {
            if (!open.has(currentItem.relative)) {
              toggleFolder(currentItem.relative);
            } else {
              // Move focus to first child if open
              const nextIndex = currentIndex + 1;
              if (nextIndex < visibleItems.length && visibleItems[nextIndex].parent === currentItem.relative) {
                setFocusedRelative(visibleItems[nextIndex].relative);
              }
            }
          }
          break;
        }
        case 'ArrowLeft': {
          e.preventDefault();
          if (currentItem.entry.browsable && open.has(currentItem.relative)) {
            toggleFolder(currentItem.relative);
          } else if (currentItem.parent !== '') {
            // Move focus to parent folder
            setFocusedRelative(currentItem.parent);
          }
          break;
        }
        case 'Home': {
          e.preventDefault();
          setFocusedRelative(visibleItems[0].relative);
          break;
        }
        case 'End': {
          e.preventDefault();
          setFocusedRelative(visibleItems[visibleItems.length - 1].relative);
          break;
        }
        case 'Enter':
        case ' ': {
          e.preventDefault();
          if (currentItem.entry.browsable) {
            toggleFolder(currentItem.relative);
          } else if (currentItem.entry.kind === 'file') {
            setSelectedRelative(currentItem.relative);
            onFile({ space: space.id, project, relative: currentItem.relative });
          }
          break;
        }
      }
    },
    [visibleItems, focusedRelative, open, toggleFolder, onFile, space.id, project]
  );

  // Breadcrumb segment clicks
  const handleBreadcrumbClick = (path: string) => {
    setSelectedFolder(path);
    setSelectedRelative(path);
    setFocusedRelative(path);
    if (path) {
      // Ensure all ancestor segments are expanded
      const segments = path.split('/');
      setOpen(old => {
        const next = new Set(old);
        let acc = '';
        for (const seg of segments) {
          acc = [acc, seg].filter(Boolean).join('/');
          next.add(acc);
        }
        return next;
      });
      if (!cache[path]) void load(path);
    }
  };

  // Breadcrumb segments breakdown
  const breadcrumbSegments = useMemo(() => {
    const list = [{ label: space.label, path: '' }];
    if (selectedFolder) {
      const parts = selectedFolder.split('/');
      let acc = '';
      for (const part of parts) {
        acc = [acc, part].filter(Boolean).join('/');
        list.push({ label: part, path: acc });
      }
    }
    return list;
  }, [space.label, selectedFolder]);

  // Render tree recursively
  const renderTree = (parent: string, depth = 0): React.ReactNode => {
    const data = cache[parent];
    const isLoading = pending.has(parent);
    const folderError = folderErrors[parent];

    if (!data && isLoading) {
      return (
        <div className="ow-tree-loading" style={{ paddingLeft: `${16 + depth * 18}px` }}>
          <RefreshCw size={12} className="ow-tree-spin" /> 목록 읽는 중…
        </div>
      );
    }

    if (!data) return null;

    const filtered = filterLoadedTreeLevel(cache,parent,filters);
    const limit = pageLimits[parent] || 50;
    const pagination = paginateSiblings(filtered, Math.ceil(limit / 50), 50);

    return (
      <div role="group" className="ow-tree-group">
        {folderError && <p className="ow-folder-error">{folderError} (이전 정상 목록 유지)</p>}
        {pagination.visible.map((entry: Row) => {
          const relative = [parent, entry.name].filter(Boolean).join('/');
          const isExpanded = open.has(relative);
          const isSelected = selectedRelative === relative;
          const isFocused = focusedRelative === relative;
          const itemPending = pending.has(relative);

          return (
            <React.Fragment key={relative}>
              <div
                role="treeitem"
                id={`treeitem-${space.id}-${encodeURIComponent(relative)}`}
                data-path={relative}
                aria-level={depth + 1}
                aria-expanded={entry.browsable ? isExpanded : undefined}
                aria-selected={isSelected}
                tabIndex={isFocused ? 0 : -1}
                className={`ow-tree-item ${isSelected ? 'is-selected' : ''}`}
                style={{ '--tree-indent': `${8 + depth * 18}px` } as React.CSSProperties}
                onFocus={()=>setFocusedRelative(relative)}
                onClick={() => {
                  if (entry.browsable) {
                    toggleFolder(relative);
                  } else if (entry.kind === 'file') {
                    setSelectedRelative(relative);
                    setFocusedRelative(relative);
                    onFile({ space: space.id, project, relative });
                  }
                }}
              >
                <span className="ow-tree-name">
                  {entry.browsable ? (
                    isExpanded ? (
                      <ChevronDown size={13} />
                    ) : (
                      <ChevronRight size={13} />
                    )
                  ) : (
                    <FileText size={13} />
                  )}
                  <span className="ow-tree-label">
                    <ProjectText text={entry.name} />
                  </span>
                  {itemPending && <RefreshCw size={10} className="ow-tree-spin" />}
                </span>
                <small>{entry.browsable ? '폴더' : size(entry.size)}</small>
                <time>{when(entry.modified_at)}</time>
              </div>
              {entry.browsable && isExpanded && depth < 20 && renderTree(relative, depth + 1)}
            </React.Fragment>
          );
        })}

        {pagination.hasMore && (
          <button
            type="button"
            className="ow-load-more"
            style={{ marginLeft: `${8 + depth * 18}px` }}
            onClick={e => {
              e.stopPropagation();
              setPageLimits(old => ({ ...old, [parent]: limit + 50 }));
            }}
          >
            + 더 보기 ({limit}개 표시 중 · {pagination.remaining}개 남음)
          </button>
        )}

        {(!data.entries?.length || data.state !== 'ready') && (
          <p className="ow-folder-note" style={{ paddingLeft: `${16 + depth * 18}px` }}>
            {data.state === 'ready' && !data.entries?.length
              ? `표시 가능한 항목이 없습니다${data.excluded ? ` · 보호 항목 ${data.excluded}개 제외` : ''}.`
              : data.reason ?? '이 범위에 표시할 파일이 없습니다.'}
          </p>
        )}
      </div>
    );
  };

  return (
    <section className="cx-card ow-space">
      <header>
        <button
          type="button"
          aria-expanded={!folded}
          onClick={() => setFolded(v => !v)}
          className="ow-space-toggle"
        >
          {folded ? <ChevronRight size={17} /> : <ChevronDown size={17} />}
          <FolderOpen size={19} />
          <h2>
            <ProjectText text={space.label} />
          </h2>
        </button>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          <button
            type="button"
            aria-label={`${space.label} 불러온 목록 필터 열기`}
            className={showFilters ? 'cx-primary' : ''}
            onClick={() => setShowFilters(v => !v)}
          >
            <Filter size={14} />
          </button>
          <button
            type="button"
            aria-label={`${space.label} 다시 읽기 (이전 결과 유지)`}
            disabled={pending.size > 0}
            onClick={() => {
              // Refresh all open folders while keeping previous cache intact
              for (const rel of open) void load(rel);
            }}
          >
            <RefreshCw size={15} className={pending.size > 0 ? 'ow-tree-spin' : ''} />
          </button>
        </div>
      </header>

      <p className="cx-muted">{space.note}</p>

      {!folded && (
        <>
          {/* Breadcrumb path navigation */}
          <nav aria-label="선택 폴더 경로 탐색" className="ow-breadcrumb">
            {breadcrumbSegments.map((seg, idx) => (
              <React.Fragment key={seg.path}>
                {idx > 0 && <ChevronRight size={11} className="ow-breadcrumb-sep" />}
                <button
                  type="button"
                  className={`ow-breadcrumb-btn ${
                    idx === breadcrumbSegments.length - 1 ? 'is-active' : ''
                  }`}
                  onClick={() => handleBreadcrumbClick(seg.path)}
                >
                  {seg.label}
                </button>
              </React.Fragment>
            ))}
          </nav>

          {/* Client-side filter on loaded entries with truthful scope note */}
          {showFilters && (
            <div className="ow-tree-filter-bar">
              <div className="ow-tree-filter-inputs">
                <input
                  type="text"
                  placeholder="불러온 목록에서 이름 검색"
                  aria-label={`${space.label} 폴더 검색`}
                  value={filters.nameQuery}
                  onChange={e => setFilters(old => ({ ...old, nameQuery: e.target.value }))}
                />
                <input
                  type="date"
                  aria-label="수정일 시작"
                  value={filters.startDate}
                  onChange={e => setFilters(old => ({ ...old, startDate: e.target.value }))}
                />
                <span>~</span>
                <input
                  type="date"
                  aria-label="수정일 종료"
                  value={filters.endDate}
                  onChange={e => setFilters(old => ({ ...old, endDate: e.target.value }))}
                />
                {(filters.nameQuery || filters.startDate || filters.endDate) && (
                  <button
                    type="button"
                    onClick={() => setFilters({ nameQuery: '', startDate: '', endDate: '' })}
                  >
                    필터 초기화
                  </button>
                )}
              </div>
              <span className="ow-tree-scope-note">
                현재 불러온 폴더 항목에만 적용됩니다. 전체 파일 전역 검색이 아닙니다.
              </span>
            </div>
          )}

          <div className="ow-file-head">
            <span>이름</span>
            <span>크기</span>
            <span>수정 시각</span>
          </div>

          <div
            ref={treeContainerRef}
            role="tree"
            aria-label={`${space.label} 폴더 트리`}
            className="ow-folder-body ow-tree"
            tabIndex={visibleItems.length?-1:0}
            onKeyDown={handleKeyDown}
          >
            {renderTree('')}
          </div>

          <footer>
            스캔 {when(cache['']?.scanned_at)} ·{' '}
            {cache['']?.state === 'partial'
              ? '일부 목록'
              : cache['']?.state === 'ready'
              ? '직접 하위 목록'
              : '읽기 미확인'}
            <br />
            하위 폴더 크기 제외 · 단일 클릭 접기/펼치기 지원
          </footer>
        </>
      )}
    </section>
  );
}

export function DataSpaces({ active, memory = false }: { active: boolean; memory?: boolean }) {
  const projectNames = useProjectNames();
  const [catalog, setCatalog] = useState<Row | null>(null),
    [project, setProject] = useState(''),
    [selection, setSelection] = useState<Row | null>(null),
    [error, setError] = useState('');
  useEffect(() => {
    if (!active) return;
    let alive = true;
    localRead(route('spaces', { project })).then(
      d => {
        if (alive) {
          setCatalog(d);
          setError(d.state === 'ready' ? '' : d.reason || '허용된 데이터 공간을 확인하지 못했습니다.');
          if (!project && d.projects?.length) setProject(d.projects[0]);
        }
      },
      () => {
        if (alive) setError('데이터 공간을 읽지 못했습니다.');
      }
    );
    return () => {
      alive = false;
    };
  }, [active, project]);
  const spaces = (catalog?.spaces ?? []).filter((s: Row) => !memory || ['memory', 'context'].includes(s.id));
  return (
    <ProjectNamesContext.Provider value={{...projectNames,...catalog?.project_names}}>
      <header className="cx-section-heading">
        <div>
          <h2>{memory ? '기억·맥락' : '과제 폴더'}</h2>
          <p>
            {memory
              ? '실제 과제의 기억·맥락 저장 공간입니다. 비어 있음과 읽기 실패를 구분합니다.'
              : '파일 선택 · 옆 미리보기'}
          </p>
        </div>
        <label>
          과제{' '}
          <select
            aria-label="데이터 공간 과제"
            value={project}
            onChange={e => {
              setProject(e.target.value);
              setSelection(null);
            }}
          >
            {catalog?.projects?.map((p: string) => (
              <option key={p} value={p}>
                {projectLabel(p, { ...projectNames, ...catalog?.project_names })}
              </option>
            ))}
          </select>
        </label>
      </header>
      {memory && (
        <p className="cx-notice">
          단기·장기·추론 기억의 분류와 활성 여부는 현재 저장 계약에 그 근거가 있을 때만 판단할 수 있습니다.
          폴더가 있다는 이유로 기억이 만들어졌다고 표시하지 않습니다.
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      <div className={`ow-spaces-container ${selection ? 'has-preview' : ''}`}>
        <div className="ow-spaces-grid">
          {spaces.map((s: Row) => (
            <SpacePanel
              key={`${s.id}:${project}`}
              space={s}
              project={project}
              onFile={setSelection}
            />
          ))}
        </div>
        {selection && <Preview selection={selection} close={() => setSelection(null)} />}
      </div>
      {!catalog && <p>허용된 데이터 공간을 읽는 중…</p>}
    </ProjectNamesContext.Provider>
  );
}

export function StandalonePreview() {
  const params = new URLSearchParams(location.search);
  const [selection] = useState({
    space: params.get('space') ?? '',
    relative: params.get('relative') ?? '',
    project: params.get('project') ?? ''
  });
  return (
    <div className="cx-app" data-theme="light">
      <Preview selection={selection} close={() => {}} standalone />
    </div>
  );
}

/**
 * Enhanced Evidence Search Leaf (B3-B5)
 * - Retains query results while rerunning with updating state
 * - Explicit initial loading & errors
 * - Project race prevention via monotonic epoch
 * - React text node query highlighting (no HTML injection)
 * - Evidence deduplication while preserving all underlying refs
 * - Truthful rank reasons & dates
 * - Default collapsed technical details
 */
export function EvidenceSearch({ active }: { active: boolean }) {
  const projectNames = useProjectNames();
  const [projects, setProjects] = useState<string[]>([]);
  const [project, setProject] = useState('');
  const [question, setQuestion] = useState('');
  const [investigation, setInvestigation] = useState(() => `ops-${crypto.randomUUID()}`);
  const [data, setData] = useState<Row | null>(null);
  const [busy, setBusy] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [selectedHit, setSelectedHit] = useState<Row | null>(null);
  const [activeQuery, setActiveQuery] = useState('');

  // Search filtering & sorting within returned results
  const [inResultQuery, setInResultQuery] = useState('');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [sortBy, setSortBy] = useState<'rank' | 'title' | 'date'>('rank');
  const [page, setPage] = useState(1);
  const pageSize = 6;

  const searchEpoch = useRef(0);

  useEffect(() => {
    if (active && !projects.length) {
      void localRead('/operations-spaces.json').then(d => {
        setProjects(d.projects ?? []);
        setProject(d.projects?.[0] ?? '');
      });
    }
  }, [active, projects.length]);

  async function search() {
    if (!project || !question.trim()) return;

    searchEpoch.current++;
    const currentEpoch = searchEpoch.current;

    setBusy(true);
    setSearchError(null);
    if (data) {
      setIsUpdating(true); // Preserve previous results while updating!
    }

    try {
      const response = await fetch('/operations-query.json', {
        method: 'POST',
        credentials: 'omit',
        redirect: 'error',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project, question, investigation }),
        signal: AbortSignal.timeout(90000)
      });

      if (!response.ok) throw Error('read');
      const resData = await response.json();
      if(resData.state!=='ready')throw Error('query_unavailable');

      // Guard against project / request races
      if (currentEpoch === searchEpoch.current) {
        setData(resData);
        setActiveQuery(question);
        setSelectedHit(null);
        setPage(1);
        if (resData.state !== 'ready') {
          setSearchError(resData.reason || '검색 결과를 가져오지 못했습니다.');
        }
      }
    } catch {
      if (currentEpoch === searchEpoch.current) {
        setSearchError(
          data
            ? '검색 갱신 요청을 완료하지 못했습니다 (이전 검색 결과 유지됨).'
            : '검색 응답을 확인하지 못했습니다. 다시 시도해도 현재 검색 묶음의 허용 횟수에서 계산됩니다.'
        );
      }
    } finally {
      if (currentEpoch === searchEpoch.current) {
        setBusy(false);
        setIsUpdating(false);
      }
    }
  }

  // Raw hits from server query envelope
  const rawHits: Row[] = data?.result?.results?.[0]?.evidence ?? [];
  const rawStatus = data?.result?.results?.[0]?.status ?? '미확인';
  const rawCode = data?.result?.results?.[0]?.code ?? '';

  // Deduplicate hits while preserving underlying refs
  const dedupedHits = useMemo(() => dedupeEvidence(rawHits), [rawHits]);

  // Client filtered & sorted hits
  const processedHits = useMemo(
    () =>
      filterAndSortEvidence(dedupedHits, {
        inResultQuery,
        sourceFilter,
        startDate,
        endDate,
        sortBy
      }),
    [dedupedHits, inResultQuery, sourceFilter, startDate, endDate, sortBy]
  );

  // Pagination
  const totalPages = Math.max(1, Math.ceil(processedHits.length / pageSize));
  const pagedHits = useMemo(() => {
    const start = (page - 1) * pageSize;
    return processedHits.slice(start, start + pageSize);
  }, [processedHits, page, pageSize]);

  // Distinct sources in returned results
  const availableSources = useMemo(() => {
    const set = new Set<string>();
    for (const h of dedupedHits) {
      for(const ref of h.evidenceRefs??[h])if(ref.source_kind)set.add(ref.source_kind);
    }
    return Array.from(set);
  }, [dedupedHits]);

  // Distribution counts
  const sourceDistribution = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const h of rawHits) {
      counts[h.source_kind] = (counts[h.source_kind] ?? 0) + 1;
    }
    return counts;
  }, [rawHits]);

  // Render highlighted text nodes without HTML injection
  const renderHighlightedText = (text: string, query: string) => {
    const segments = splitTextForHighlight(text, query);
    return segments.map((seg, i) =>
      seg.isMatch ? (
        <mark key={i} className="ow-highlight">
          {seg.text}
        </mark>
      ) : (
        <React.Fragment key={i}>{seg.text}</React.Fragment>
      )
    );
  };

  return (
    <>
      <section className="cx-card">
        <header className="cx-section-heading">
          <div>
            <h2>자료 검색</h2>
            <p>선택 과제의 검색 DB에서 관련 본문을 찾습니다.</p>
          </div>
        </header>

        <form
          className="ow-query"
          onSubmit={e => {
            e.preventDefault();
            void search();
          }}
        >
          <select
            disabled={busy}
            aria-label="검색 과제"
            value={project}
            onChange={e => {
              searchEpoch.current++;
              setProject(e.target.value);
              setData(null);
              setSelectedHit(null);
              setActiveQuery('');
            }}
          >
            {projects.map(p => (
              <option key={p} value={p}>
                {projectLabel(p, projectNames)}
              </option>
            ))}
          </select>
          <input
            disabled={busy}
            aria-label="질문 또는 검색어"
            placeholder="확인할 개념이나 정확한 검색어를 입력하세요 (예: 하이드로폰)"
            maxLength={2000}
            value={question}
            onChange={e => setQuestion(e.target.value)}
          />
          <button className="cx-primary" disabled={busy || !project || !question.trim()}>
            <Search size={16} />
            {busy ? '검색 중…' : '검색'}
          </button>
        </form>

        <p className="cx-footnote">
          단어 검색 · LLM·임베딩 호출 없음 · 결과 최대 12개 · 검색 묶음당 최대 6회. 생성 답변과 3D 그래프는
          이번 범위에서 제외합니다.
        </p>
      </section>

      {/* Loading & Stale banners */}
      {isUpdating && (
        <div className="ow-search-status-bar is-updating" role="status">
          <span>새 검색 결과를 조회하고 있습니다 (현재는 이전 결과 유지 중)…</span>
          <RefreshCw size={14} className="ow-tree-spin" />
        </div>
      )}

      {busy && !data && (
        <div className="ow-search-status-bar is-initial" role="status">
          <span>검색 근거를 조회하고 있습니다…</span>
          <RefreshCw size={14} className="ow-tree-spin" />
        </div>
      )}

      {searchError && (
        <div className="ow-search-status-bar is-error" role="alert">
          <span>{searchError}</span>
        </div>
      )}

      {/* Search results */}
      {data?.result && (
        <div className={`ow-evidence-split ${selectedHit ? 'has-selected' : ''}`}>
          <div className="ow-evidence-results-col">
            <section className="cx-card">
              <header className="cx-section-heading">
                <div>
                  <h2>검색 결과·출처</h2>
                  <p>
                    {when(data.result.asked_at)} · 반환된 자료 범위에서 확인
                    {dedupedHits.length < rawHits.length && (
                      <span> · 동일 문서 {rawHits.length - dedupedHits.length}건 묶음 정리</span>
                    )}
                  </p>
                </div>
                <span>
                  남은 조회{' '}
                  <span title={formatExact(data.remaining)}>{formatAmount(data.remaining)}</span>회
                </span>
              </header>

              {/* Source distribution */}
              {rawHits.length > 0 && (
                <div className="ow-distribution">
                  {Object.entries(sourceDistribution).map(([key, count]) => (
                    <div key={key}>
                      <span>{sourceLabel(key)}</span>
                      <div>
                        <i style={{ width: `${(Number(count) / Math.max(rawHits.length, 1)) * 100}%` }} />
                      </div>
                      <strong>
                        {formatAmount(count)} / {formatAmount(rawHits.length)}
                      </strong>
                    </div>
                  ))}
                </div>
              )}

              {/* In-result filter & sort bar */}
              <div className="ow-search-filters">
                <input
                  type="text"
                  placeholder="결과 내 검색 (제목, 본문, ID)"
                  value={inResultQuery}
                  onChange={e => {
                    setInResultQuery(e.target.value);
                    setPage(1);
                  }}
                />
                <label>
                  출처
                  <select
                    value={sourceFilter}
                    onChange={e => {
                      setSourceFilter(e.target.value);
                      setPage(1);
                    }}
                  >
                    <option value="all">전체 출처 ({dedupedHits.length})</option>
                    {availableSources.map(s => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  정렬
                  <select
                    value={sortBy}
                    onChange={e => setSortBy(e.target.value as 'rank' | 'title' | 'date')}
                  >
                    <option value="rank">순위순</option>
                    <option value="title">제목순</option>
                    <option value="date">날짜순</option>
                  </select>
                </label>
                <label>
                  날짜
                  <input
                    type="date"
                    aria-label="시작일"
                    value={startDate}
                    onChange={e => {
                      setStartDate(e.target.value);
                      setPage(1);
                    }}
                  />
                  ~
                  <input
                    type="date"
                    aria-label="종료일"
                    value={endDate}
                    onChange={e => {
                      setEndDate(e.target.value);
                      setPage(1);
                    }}
                  />
                </label>
              </div>

              {/* Evidence cards list */}
              <p className="cx-footnote">출처·기간·정렬은 반환된 결과 안에서 적용합니다. 기간을 지정하면 날짜가 제공되지 않은 결과는 제외됩니다.</p>
              <div
                className="ow-evidence-list"
                role="list"
                aria-label="검색 근거 목록"
                onKeyDown={e => {
                  if((e.target as HTMLElement).closest('details'))return;
                  if (!pagedHits.length) return;
                  const idx = pagedHits.findIndex(h => h === selectedHit);
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    const next = Math.min(pagedHits.length - 1, (idx >= 0 ? idx : -1) + 1);
                    setSelectedHit(pagedHits[next]);
                    e.currentTarget.querySelectorAll<HTMLElement>('.ow-evidence-card')[next]?.focus();
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    const prev = Math.max(0, (idx >= 0 ? idx : 1) - 1);
                    setSelectedHit(pagedHits[prev]);
                    e.currentTarget.querySelectorAll<HTMLElement>('.ow-evidence-card')[prev]?.focus();
                  } else if (e.key === 'Escape') {
                    setSelectedHit(null);
                  }
                }}
              >
                {pagedHits.map((r, i) => {
                  const isSelected = selectedHit === r;
                  const itemDate = extractDatesFromEvidence(r);
                  const rankReason = calculateTruthfulRankReason(r, activeQuery || question);
                  const snippet = extractMatchSnippet(r.text, activeQuery || question, 130,r.displayTitle||r.title);

                  return (
                    <div
                      key={`${r.unit_id}:${i}`}
                      role="listitem"
                      tabIndex={0}
                      className={`ow-evidence-card ${isSelected ? 'is-selected' : ''}`}
                      onClick={() => setSelectedHit(r)}
                      onKeyDown={e => {
                        if(e.target!==e.currentTarget)return;
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setSelectedHit(r);
                        }
                      }}
                    >
                      <span className="ow-source">{[...new Set((r.evidenceRefs??[r]).map((ref:Row)=>({voice:'PLAUD·음성',slack:'Slack',linear:'Linear',mail:'메일',document:'문서',docs:'문서',buzz:'Buzz'} as Row)[ref.source_kind]??ref.source_kind))].join(' · ')}</span>
                      <div className="ow-evidence-card-content">
                        <div className="ow-evidence-card-title">
                          <span>
                            {renderHighlightedText(
                              r.displayTitle || r.title || r.item_id,
                              activeQuery || question
                            )}
                          </span>
                          {r.duplicateRefs?.length > 0 && (
                            <span className="ow-tree-badge">
                              중복 근거 +{r.duplicateRefs.length}건
                            </span>
                          )}
                        </div>

                        {/* Distinct match snippet with pure React query highlighting */}
                        <p className="ow-evidence-snippet">
                          {snippet?renderHighlightedText(snippet, activeQuery || question):'제목에서 검색어가 확인된 자료입니다.'}
                        </p>

                        <div className="ow-evidence-meta">
                          <span className="ow-rank-badge">순위 #{r.rank}</span>
                          <span className="ow-rank-reason">{rankReason}</span>
                          {itemDate ? (
                            <span className="ow-date-badge">{when(itemDate)}</span>
                          ) : (
                            <span className="ow-date-badge is-unknown">날짜 미확인</span>
                          )}
                          {typeof r.score==='number'&&<span title={formatExact(r.score)}>점수 {formatAmount(r.score)}</span>}
                        </div>

                        {/* Default-collapsed technical details */}
                        <details
                          className="ow-tech-details"
                          onClick={e => e.stopPropagation()}
                        >
                          <summary>기술 정보 (식별자·위치·원문 근거)</summary>
                          <div className="ow-tech-content">
                            <p>단위 ID: <code>{r.unit_id}</code></p>
                            <p>문서 ID: <code>{r.item_id}</code></p>
                            {r.revision_sha256 && (
                              <p>판본 해시: <code>{r.revision_sha256}</code></p>
                            )}
                            {r.locator && (
                              <pre className="ow-tech-pre">
                                {JSON.stringify(r.locator, null, 2)}
                              </pre>
                            )}
                            {r.duplicateRefs?.length > 0 && (
                              <div>
                                <strong>함께 묶은 문서·본문 근거 ({r.duplicateRefs.length}건):</strong>
                                <ul>
                                  {r.duplicateRefs.map((d: Row, di: number) => (
                                    <li key={di}>
                                      순위 #{d.rank} · 단위 {d.unit_id} ·{' '}
                                      {d.score ? `점수 ${d.score.toFixed(3)}` : '점수 미제공'}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        </details>
                      </div>
                      <ChevronRight size={15} />
                    </div>
                  );
                })}

                {!pagedHits.length && (
                  <p className="ow-folder-note">
                    {dedupedHits.length
                      ? '선택한 필터 조건에 부합하는 검색 결과가 없습니다.'
                      : '이 검색에서 반환된 근거가 없습니다. 데이터 전체가 비어 있다는 뜻은 아닙니다.'}
                  </p>
                )}
              </div>

              {/* Pagination controls */}
              {totalPages > 1 && (
                <div className="ow-pagination">
                  <span>
                    총 {processedHits.length}개 중 {(page - 1) * pageSize + 1}~
                    {Math.min(page * pageSize, processedHits.length)}개 표시 (페이지 {page} / {totalPages})
                  </span>
                  <div className="ow-pagination-btns">
                    <button
                      type="button"
                      disabled={page <= 1}
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                    >
                      이전
                    </button>
                    <button
                      type="button"
                      disabled={page >= totalPages}
                      onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    >
                      다음
                    </button>
                  </div>
                </div>
              )}
            </section>
          </div>

          {/* Selected evidence detail panel */}
          {selectedHit && (
            <div className="ow-evidence-detail-col">
              <section className="cx-card ow-evidence-detail">
                <header className="cx-section-heading">
                  <div>
                    <h2>검색 결과의 원문 위치</h2>
                    <p>
                      <strong>{selectedHit.displayTitle||'제목이 제공되지 않은 자료'}</strong> · {sourceLabel(selectedHit.source_kind)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedHit(null)}
                    aria-label="선택 해제"
                  >
                    <X size={16} />
                  </button>
                </header>

                <div className="ow-evidence-body">
                  <p className="ow-evidence-lead-text">
                    {renderHighlightedText(
                      cleanHumanText(selectedHit.text),
                      activeQuery || question
                    )}
                  </p>

                  <div className="ow-evidence-meta" style={{ marginBottom: '14px' }}>
                    <span className="ow-rank-badge">순위 #{selectedHit.rank}</span>
                    <span className="ow-rank-reason">
                      {calculateTruthfulRankReason(selectedHit, activeQuery || question)}
                    </span>
                    {extractDatesFromEvidence(selectedHit) ? (
                      <span className="ow-date-badge">
                        {when(extractDatesFromEvidence(selectedHit))}
                      </span>
                    ) : (
                      <span className="ow-date-badge is-unknown">날짜 미확인</span>
                    )}
                  </div>

                  {/* Collapsed Technical details */}
                  <details className="ow-tech-details">
                    <summary>기술 정보 (UUID·위치·처리 버전 근거)</summary>
                    <div className="ow-tech-content">
                      <p>조사 식별자: <code>{investigation}</code></p>
                      <p>문서 식별자: <code>{selectedHit.item_id}</code></p><p>청크 식별자: <code>{selectedHit.unit_id}</code></p>
                      <p>
                        처리 버전:{' '}
                        <code>{data.result.generation?.generation_id ?? '미제공'}</code>
                      </p>
                      {selectedHit.revision_sha256 && (
                        <p>
                          판본 SHA-256: <code>{selectedHit.revision_sha256}</code>
                        </p>
                      )}
                      <p>위치 정보 (locator):</p>
                      <pre className="ow-tech-pre">
                        {JSON.stringify(
                          {
                            locator: selectedHit.locator,
                            revision_sha256: selectedHit.revision_sha256,
                            via: selectedHit.via
                          },
                          null,
                          2
                        )}
                      </pre>
                    </div>
                  </details>
                </div>
              </section>
            </div>
          )}
        </div>
      )}

      <button
        disabled={busy}
        onClick={() => {
          setInvestigation(`ops-${crypto.randomUUID()}`);
          setData(null);
          setSelectedHit(null);
          setActiveQuery('');
        }}
      >
        새 검색 묶음 시작
      </button>
      <p className="cx-footnote">
        질문 원문과 검색 결과는 이 화면에만 유지합니다. 검색 실행 기록에는 호출·결과 코드만 남습니다.
      </p>
    </>
  );
}

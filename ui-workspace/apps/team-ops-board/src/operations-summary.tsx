import {useCallback, useRef, type ReactNode} from 'react';
import {ArrowRight} from 'lucide-react';
import {buildOperationsSummaryView} from './core/operations-summary-view.mjs';
import './operations-summary.css';

type Row = Record<string, any>;

interface OperationsSummaryProps {
  model: Row;
  inputs: Row;
  failed: string[];
}

interface SparklinePoint {
  date?: string | null;
  label?: string | null;
  value: number | null;
}

function MiniSparkline({
  points,
  ariaLabel,
  colorClass = 'token',
}: {
  points: SparklinePoint[];
  ariaLabel: string;
  colorClass?: string;
}) {
  const validPoints = points.filter(p => typeof p.value === 'number' && Number.isFinite(p.value));
  if (validPoints.length === 0) {
    return (
      <div className="op-spark-unavailable" aria-label={`${ariaLabel}: 기록 없음`}>
        <span>이력 미확인</span>
      </div>
    );
  }

  const values = validPoints.map(p => p.value as number);
  const minVal = 0;
  const maxVal = Math.max(...values, 1);
  const range = maxVal - minVal;

  const width = 120;
  const height = 24;
  const padTop = 3;
  const padBottom = 3;
  const effHeight = height - padTop - padBottom;
  const n = points.length;
  const step = n > 1 ? width / (n - 1) : 0;

  // Build line path segments preserving null/gaps (no bridges across missing points)
  const segments: string[] = [];
  let currentSeg: string[] = [];

  points.forEach((p, i) => {
    const x = Math.round(i * step * 10) / 10;
    if (p.value === null || !Number.isFinite(p.value)) {
      if (currentSeg.length > 0) {
        segments.push(currentSeg.join(' '));
        currentSeg = [];
      }
    } else {
      const normY = (p.value - minVal) / (range || 1);
      const y = Math.round((height - padBottom - normY * effHeight) * 10) / 10;
      if (currentSeg.length === 0) {
        currentSeg.push(`M ${x} ${y}`);
      } else {
        currentSeg.push(`L ${x} ${y}`);
      }
    }
  });
  if (currentSeg.length > 0) {
    segments.push(currentSeg.join(' '));
  }

  return (
    <div className="op-sparkline-wrap" role="img" aria-label={`${ariaLabel}: ${points.map(p=>`${p.label ?? p.date ?? ''} ${p.value ?? '미확인'}`).join(', ')}`} title={`${ariaLabel} · 범위 0–${maxVal.toLocaleString('ko-KR')} · 빈 구간은 기록 없음`}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className={`op-sparkline-svg is-${colorClass}`}
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        {segments.map((d, idx) => (
          <path key={idx} d={d} fill="none" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
        ))}
        {points.map((p, i) => {
          if (p.value === null || !Number.isFinite(p.value)) return null;
          const x = Math.round(i * step * 10) / 10;
          const normY = (p.value - minVal) / (range || 1);
          const y = Math.round((height - padBottom - normY * effHeight) * 10) / 10;
          const isLast = i === n - 1;
          return (
            <circle
              key={i}
              cx={x}
              cy={y}
              r={isLast ? 2.5 : 1.5}
              className={`op-sparkline-dot${isLast ? ' is-last' : ''}`}
            />
          );
        })}
      </svg>
    </div>
  );
}

interface SegmentBarItem {
  key: string;
  label: string;
  count: number;
  severity: 'ok' | 'warn' | 'crit' | 'unknown' | 'pending';
}

function SegmentedStatusBar({
  items,
  total,
  ariaLabel,
  customLegend,
}: {
  items: SegmentBarItem[];
  total: number;
  ariaLabel: string;
  customLegend?: ReactNode;
}) {
  if (total === 0 || items.length === 0) {
    return (
      <div className="op-spark-unavailable" aria-label={`${ariaLabel}: 상태 미확인`}>
        <span>상태 미확인</span>
      </div>
    );
  }

  const activeItems = items.filter(i => i.count > 0);

  return (
    <div className="op-seg-bar-wrap" role="img" aria-label={`${ariaLabel}: ${activeItems.map(i => `${i.label} ${i.count}개`).join(', ')}`}>
      <div className="op-seg-bar-track" aria-hidden="true">
        {activeItems.map(item => {
          const pct = Math.max(2, (item.count / total) * 100);
          return (
            <div
              key={item.key}
              className={`op-seg-bar-fill is-${item.severity}`}
              style={{width: `${pct}%`}}
              title={`${item.label} ${item.count}개 (${Math.round((item.count / total) * 100)}%)`}
            />
          );
        })}
      </div>
      {customLegend ? (
        <div className="op-seg-bar-legend">{customLegend}</div>
      ) : (
        <div className="op-seg-bar-legend">
          {activeItems.map(item => (
            <span key={item.key} className="op-seg-bar-legend-item">
              <i className={`op-summary-dot is-${item.severity}`} />
              <span>{item.label} <b>{item.count}</b></span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export function OperationsSummary({model, inputs, failed}: OperationsSummaryProps) {
  const summary = buildOperationsSummaryView(inputs, failed, model);
  const sectionRef = useRef<HTMLElement>(null);

  const scrollToPanel = useCallback((selector: string) => {
    const dashboard = sectionRef.current?.closest('.vd-dashboard');
    if (!dashboard) return;
    const target = dashboard.querySelector(selector);
    if (!target) return;
    const heading = target.querySelector('h2');
    if (heading instanceof HTMLElement) {
      heading.tabIndex = -1;
      heading.focus({preventScroll: true});
    }
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    target.scrollIntoView({behavior: prefersReducedMotion ? 'auto' : 'smooth', block: 'start'});
  }, []);

  const severityText = (s: string) => (s === 'ok' ? '정상' : s === 'warn' ? '주의' : s === 'crit' ? '이상' : '미확인');

  // Collection segments: normal, pending/processing, problem, unknown/failed
  const collectionTotal = summary.collection.total ?? 0;
  const unknownOrFailed = (summary.collection.unknown ?? 0) + (summary.collection.observationError ?? 0);
  const collectionSegments: SegmentBarItem[] = [
    { key: 'ok', label: '정상', count: summary.collection.normal ?? 0, severity: 'ok' },
    { key: 'proc', label: '진행/보류', count: (summary.collection.processing ?? 0) + (summary.collection.pending ?? 0), severity: 'pending' },
    { key: 'prob', label: '이상', count: summary.collection.problem ?? 0, severity: 'crit' },
    { key: 'unk', label: '미확인', count: unknownOrFailed, severity: 'unknown' },
  ];

  // Model hosts segments: responding, refused, timeout, unknown
  const hostsList: any[] = summary.models.hosts ?? [];
  const modelTotal = summary.models.totalHosts ?? 0;
  const modelResponding = hostsList.filter((h: any) => h.connection === 'responding').length;
  const modelRefused = hostsList.filter((h: any) => h.connection === 'refused').length;
  const modelTimeout = hostsList.filter((h: any) => h.connection === 'timeout').length;
  const modelUnknown = Math.max(0, modelTotal - modelResponding - modelRefused - modelTimeout);
  const modelSegments: SegmentBarItem[] = [
    { key: 'ok', label: '정상', count: modelResponding, severity: 'ok' },
    { key: 'warn', label: '지연', count: modelTimeout, severity: 'warn' },
    { key: 'crit', label: '거부', count: modelRefused, severity: 'crit' },
    { key: 'unk', label: '미확인', count: modelUnknown, severity: 'unknown' },
  ];

  // Quota footer state calculation
  const critQuotas = summary.quotas.providers.filter((p: any) => p.current && typeof p.remaining === 'number' && p.remaining < 10);
  const warnQuotas = summary.quotas.providers.filter((p: any) => p.current && typeof p.remaining === 'number' && p.remaining >= 10 && p.remaining < 25);
  let quotaFootText = '최신 한도 확인';
  let quotaFootPillSeverity = 'ok';
  let quotaFootPillLabel = '확인됨';
  if (summary.quotas.allUnknown) {
    quotaFootText = '잔량 확인 불가';
    quotaFootPillSeverity = 'idle';
    quotaFootPillLabel = '미확인';
  } else if (critQuotas.length > 0) {
    quotaFootText = `한도 부족 ${critQuotas.length}곳`;
    quotaFootPillSeverity = 'crit';
    quotaFootPillLabel = `부족 ${critQuotas.length}곳`;
  } else if (warnQuotas.length > 0) {
    quotaFootText = `한도 주의 ${warnQuotas.length}곳`;
    quotaFootPillSeverity = 'warn';
    quotaFootPillLabel = `주의 ${warnQuotas.length}곳`;
  } else if (summary.quotas.anyUnknown) {
    quotaFootText = '일부 기간 확인 불가';
    quotaFootPillSeverity = 'warn';
    quotaFootPillLabel = '일부';
  }

  // Issues / Attention current state segments
  const brokenList: any[] = summary.issues.brokenNodes ?? [];
  const brokenHostsCount = brokenList.filter((b: any) => b.type === 'host').length;
  const brokenNodesCount = brokenList.filter((b: any) => b.type === 'node').length;
  const issuesTotal = summary.issues.totalCount ?? 0;
  const issueSegments: SegmentBarItem[] = [
    { key: 'crit', label: '호스트 이상', count: brokenHostsCount, severity: 'crit' },
    { key: 'warn', label: '운영 점검', count: brokenNodesCount, severity: 'warn' },
  ];

  return (
    <section ref={sectionRef} className="op-summary-strip" aria-label="운영 종합 요약">
      {/* 1. 남은 한도 */}
      <button
        type="button"
        className="op-summary-card"
        onClick={() => scrollToPanel('.vd-quota-overview')}
        aria-label="남은 한도 상세 보기 (최저 기준)"
      >
        <div className="op-summary-head">
          <div className="op-summary-head-title">
            <strong>남은 한도</strong>
            <span className="op-summary-sub">현재 잔량비</span>
          </div>
          <ArrowRight size={13} className="op-summary-arrow" aria-hidden="true" />
        </div>
        <div className="op-summary-body">
          {summary.quotas.providers.length > 0 ? (
            <div className="op-quota-rows">
              {summary.quotas.providers.map(p => {
                let labelName = p.provider;
                if (p.provider === 'AG·Gemini' || p.provider === 'AG(Gemini)') {
                  labelName = 'AG Gemini';
                } else if (p.provider === 'AG·Claude+GPT' || p.provider === 'AG·Claude/GPT' || p.provider === 'AG(Claude+GPT)' || p.provider.startsWith('AG·Claude')) {
                  labelName = 'AG C+G';
                } else if (p.provider.startsWith('AG·')) {
                  labelName = `AG ${p.provider.replace('AG·', '')}`;
                }
                const valStr = p.current && p.remaining !== null ? `${p.remaining}%` : '—';
                const windowTag = p.current ? ` (${p.window})` : '';
                const pct = p.current && p.remaining !== null ? Math.max(0, Math.min(100, p.remaining)) : 0;
                return (
                  <div className="op-quota-row" key={p.provider}>
                    <span
                      className="op-quota-name"
                      title={p.provider.startsWith('AG·') ? 'Antigravity 공유 한도' : undefined}
                    >
                      {labelName}
                    </span>
                    <div className="op-quota-track-cell">
                      {p.current && p.remaining !== null ? (
                        <div className="op-quota-mini-track" aria-hidden="true">
                          <div className={`op-quota-mini-fill is-${p.severity}`} style={{width: `${pct}%`}} />
                        </div>
                      ) : (
                        <div className="op-quota-mini-track is-unknown" aria-hidden="true" />
                      )}
                    </div>
                    <span className={`op-quota-val is-${p.severity}`}>
                      {valStr}
                      <small>{windowTag}</small>
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="op-summary-value">
              <span className="op-summary-val-main">—</span>
            </div>
          )}
        </div>
        <div className="op-summary-foot">
          <span>{quotaFootText}</span>
          <span className={`op-summary-state-pill is-${quotaFootPillSeverity}`}>
            <i className={`op-summary-dot is-${quotaFootPillSeverity}`} />
            {quotaFootPillLabel}
          </span>
        </div>
      </button>

      {/* 2. 토큰 사용 */}
      <button
        type="button"
        className="op-summary-card"
        onClick={() => scrollToPanel('.vd-usage')}
        aria-label="토큰 사용 상세 보기"
      >
        <div className="op-summary-head">
          <div className="op-summary-head-title">
            <strong>토큰 사용</strong>
            <span className="op-summary-sub">최근 7일 추이</span>
          </div>
          <ArrowRight size={13} className="op-summary-arrow" aria-hidden="true" />
        </div>
        <div className="op-summary-body">
          <div className="op-summary-value-row">
            <div className="op-summary-value">
              <span className="op-summary-val-main">{summary.tokens.label}</span>
              {summary.tokens.state === 'ready' && <span className="op-summary-val-unit">토큰</span>}
            </div>
            {summary.tokens.todayTokens && (
              <span className="op-summary-val-sub">오늘 {summary.tokens.todayTokens}</span>
            )}
          </div>
          <div className="op-summary-visual-slot">
            <div className="op-slot-meta">
              <span>최근 7일</span>
              <span>토큰</span>
            </div>
            <MiniSparkline
              points={summary.tokens.sparkline ?? []}
              ariaLabel="최근 7일 토큰 소비 추이"
              colorClass="token"
            />
          </div>
        </div>
        <div className="op-summary-foot">
          <span>{summary.tokens.hasPartial ? '부분 측정 (추이 참조)' : summary.tokens.state === 'ready' ? '전체 측정' : '조회 실패'}</span>
          <span className={`op-summary-state-pill is-${summary.tokens.state === 'ready' ? (summary.tokens.hasPartial ? 'warn' : 'ok') : 'idle'}`}>
            <i className={`op-summary-dot is-${summary.tokens.state === 'ready' ? (summary.tokens.hasPartial ? 'warn' : 'ok') : 'idle'}`} />
            {summary.tokens.state === 'ready' ? (summary.tokens.hasPartial ? '부분' : '측정됨') : '미확인'}
          </span>
        </div>
      </button>

      {/* 3. 자료 수집 */}
      <button
        type="button"
        className="op-summary-card"
        onClick={() => scrollToPanel('.oc-judgment')}
        aria-label="자료 수집 상세 보기"
      >
        <div className="op-summary-head">
          <div className="op-summary-head-title">
            <strong>자료 수집</strong>
            <span className="op-summary-sub">현재 수집기</span>
          </div>
          <ArrowRight size={13} className="op-summary-arrow" aria-hidden="true" />
        </div>
        <div className="op-summary-body">
          <div className="op-summary-value-row">
            <div className="op-summary-value">
              <span className="op-summary-val-main">{summary.collection.label}</span>
              {summary.collection.state === 'ready' && <span className="op-summary-val-unit">수집기</span>}
            </div>
            {summary.collection.state === 'ready' && (
              <span className="op-summary-val-sub">
                정상 {Math.round(((summary.collection.normal ?? 0) / Math.max(1, collectionTotal)) * 100)}%
              </span>
            )}
          </div>
          <div className="op-summary-visual-slot">
            <div className="op-slot-meta">
              <span>현재 상태</span>
              <span>{collectionTotal}기</span>
            </div>
            <SegmentedStatusBar
              items={collectionSegments}
              total={collectionTotal}
              ariaLabel="수집기 현재 상태 분포"
            />
          </div>
        </div>
        <div className="op-summary-foot">
          <span>{summary.collection.state === 'ready' ? '수집기 단위' : '수집 상태 미확인'}</span>
          <span className={`op-summary-state-pill is-${summary.collection.severity}`}>
            <i className={`op-summary-dot is-${summary.collection.severity}`} />
            {severityText(summary.collection.severity)}
          </span>
        </div>
      </button>

      {/* 4. 검색 준비 */}
      <button
        type="button"
        className="op-summary-card"
        onClick={() => scrollToPanel('.oc-rag')}
        aria-label="검색 준비 상세 보기"
      >
        <div className="op-summary-head">
          <div className="op-summary-head-title">
            <strong>검색 준비</strong>
            <span className="op-summary-sub">검색용 문서</span>
          </div>
          <ArrowRight size={13} className="op-summary-arrow" aria-hidden="true" />
        </div>
        <div className="op-summary-body">
          <div className="op-summary-value-row">
            <div className="op-summary-value">
              <span className="op-summary-val-main">{summary.rag.docsLabel}</span>
              {summary.rag.state === 'ready' && <span className="op-summary-val-unit">건</span>}
            </div>
            {summary.rag.state === 'ready' && (
              <span className="op-summary-val-sub">
                과제 {summary.rag.matchedLabel} 일치
              </span>
            )}
          </div>
          <div className="op-summary-visual-slot">
            <div className="op-slot-meta">
              <span>최근 7일</span>
              <span>문서</span>
            </div>
            <MiniSparkline
              points={summary.rag.sparkline ?? []}
              ariaLabel="최근 7일 검색용 문서 보유량 추이"
              colorClass="rag"
            />
          </div>
        </div>
        <div className="op-summary-foot">
          <span>{summary.rag.state === 'ready' ? '저장 버전·수량 기준' : 'RAG 상태 확인 불가'}</span>
          <span className={`op-summary-state-pill is-${summary.rag.severity}`}>
            <i className={`op-summary-dot is-${summary.rag.severity}`} />
            {severityText(summary.rag.severity)}
          </span>
        </div>
      </button>

      {/* 5. 모델 연결 */}
      <button
        type="button"
        className="op-summary-card"
        onClick={() => scrollToPanel('.oc-models')}
        aria-label="모델 연결 상세 보기"
      >
        <div className="op-summary-head">
          <div className="op-summary-head-title">
            <strong>모델 연결</strong>
            <span className="op-summary-sub">현재 서버</span>
          </div>
          <ArrowRight size={13} className="op-summary-arrow" aria-hidden="true" />
        </div>
        <div className="op-summary-body">
          <div className="op-summary-value-row">
            <div className="op-summary-value">
              <span className="op-summary-val-main">{summary.models.label}</span>
              {summary.models.state === 'ready' && <span className="op-summary-val-unit">서버</span>}
            </div>
            {summary.models.state === 'ready' && (
              <span className="op-summary-val-sub">
                정상 {Math.round((modelResponding / Math.max(1, modelTotal)) * 100)}%
              </span>
            )}
          </div>
          <div className="op-summary-visual-slot">
            <div className="op-slot-meta">
              <span>현재 상태</span>
              <span>{modelTotal}대</span>
            </div>
            <SegmentedStatusBar
              items={modelSegments}
              total={modelTotal}
              ariaLabel="모델 호스트 현재 응답 분포"
              customLegend={hostsList.length > 0 ? (
                <>
                  {hostsList.map((h: any) => (
                    <span key={h.id} className="op-seg-bar-legend-item">
                      <i className={`op-summary-dot is-${h.severity}`} />
                      <span>{h.label} <b>{h.stateText}</b></span>
                    </span>
                  ))}
                </>
              ) : undefined}
            />
          </div>
        </div>
        <div className="op-summary-foot">
          <span>{summary.models.workActivity ? `에이전트 ${summary.models.workActivity}` : '추론 성공과 별도'}</span>
          <span className={`op-summary-state-pill is-${summary.models.severity}`}>
            <i className={`op-summary-dot is-${summary.models.severity}`} />
            {severityText(summary.models.severity)}
          </span>
        </div>
      </button>

      {/* 6. 확인할 항목 */}
      <button
        type="button"
        className="op-summary-card"
        onClick={() => scrollToPanel('.oc-judgment')}
        aria-label="확인할 항목 상세 보기"
      >
        <div className="op-summary-head">
          <div className="op-summary-head-title">
            <strong>확인할 항목</strong>
            <span className="op-summary-sub">현재 진단</span>
          </div>
          <ArrowRight size={13} className="op-summary-arrow" aria-hidden="true" />
        </div>
        <div className="op-summary-body">
          <div className="op-summary-value-row">
            <div className="op-summary-value">
              <span className="op-summary-val-main">{summary.issues.label}</span>
              {summary.issues.label !== '—' && <span className="op-summary-val-unit">건</span>}
            </div>
            <span className="op-summary-val-sub">
              {summary.issues.countsKnown
                ? issuesTotal === 0
                  ? '조치 대상 없음'
                  : `주의/이상 ${issuesTotal}건`
                : '진단 미확인'}
            </span>
          </div>
          <div className="op-summary-visual-slot">
            <div className="op-slot-meta">
              <span>현재 상태</span>
              <span>{!summary.issues.countsKnown ? '미확인' : issuesTotal === 0 ? '조치 없음' : `${issuesTotal}건`}</span>
            </div>
            {issuesTotal > 0 ? (
              <SegmentedStatusBar
                items={issueSegments}
                total={issuesTotal}
                ariaLabel="점검 대상 현재 상태 분포"
              />
            ) : (
              <div className="op-issues-normal-state">
                <div className="op-issue-clear-dot" style={{color: summary.issues.countsKnown ? 'var(--green)' : 'var(--muted)'}}>
                  <i className={`op-summary-dot is-${summary.issues.countsKnown ? 'ok' : 'idle'}`} />
                  <span>{summary.issues.countsKnown ? '현재 점검 이상 없음' : '관측 범위 미확인'}</span>
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="op-summary-foot">
          <span>
            {summary.issues.unknownCount !== null && summary.issues.unknownCount > 0
              ? `미확인 ${summary.issues.unknownCount}개`
              : summary.issues.countsKnown
              ? '진단 완료'
              : '일부 진단 미확인'}
          </span>
          <span className={`op-summary-state-pill is-${summary.issues.severity}`}>
            <i className={`op-summary-dot is-${summary.issues.severity}`} />
            {severityText(summary.issues.severity)}
          </span>
        </div>
      </button>
    </section>
  );
}

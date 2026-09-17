import {useCallback, useRef} from 'react';
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
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  const range = maxVal === minVal ? (maxVal === 0 ? 1 : maxVal) : maxVal - minVal;

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
    <div className="op-sparkline-wrap" role="img" aria-label={`${ariaLabel}: ${points.map(p=>`${p.label ?? p.date ?? ''} ${p.value ?? '미확인'}`).join(', ')}`} title={`${ariaLabel} · 범위 ${minVal.toLocaleString('ko-KR')}–${maxVal.toLocaleString('ko-KR')} · 빈 구간은 기록 없음`}>
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
            <span className="op-summary-sub">기간별 최저</span>
          </div>
          <ArrowRight size={13} className="op-summary-arrow" aria-hidden="true" />
        </div>
        <div className="op-summary-body">
          {summary.quotas.providers.length > 0 ? (
            <div className="op-quota-rows">
              {summary.quotas.providers.map(p => {
                const labelName = p.provider.startsWith('AG·')
                  ? `AG(${p.provider.replace('AG·', '')})`
                  : p.provider;
                const valStr = p.current && p.remaining !== null ? `${p.remaining}%` : '—';
                const windowTag = p.current ? ` (${p.window})` : '';
                const pct = p.current && p.remaining !== null ? Math.max(0, Math.min(100, p.remaining)) : 0;
                return (
                  <div className="op-quota-row" key={p.provider}>
                    <div className="op-quota-label-wrap">
                      <span
                        className="op-quota-name"
                        title={p.provider.startsWith('AG·') ? 'Antigravity 공유 한도' : undefined}
                      >
                        {labelName}
                      </span>
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
          <span>{summary.quotas.allUnknown ? '잔량 확인 불가' : summary.quotas.anyUnknown ? '일부 기간 확인 불가' : '최신 한도 확인'}</span>
          <span className={`op-summary-state-pill is-${summary.quotas.allUnknown ? 'idle' : summary.quotas.anyUnknown ? 'warn' : 'ok'}`}>
            <i className={`op-summary-dot is-${summary.quotas.allUnknown ? 'idle' : summary.quotas.anyUnknown ? 'warn' : 'ok'}`} />
            {summary.quotas.allUnknown ? '미확인' : summary.quotas.anyUnknown ? '일부' : '확인됨'}
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
        onClick={() => scrollToPanel('.vd-arrival-chart')}
        aria-label="자료 수집 상세 보기"
      >
        <div className="op-summary-head">
          <div className="op-summary-head-title">
            <strong>자료 수집</strong>
            <span className="op-summary-sub">수집기 상태별</span>
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
                보류 {summary.collection.pending ?? 0} · 미확인 {summary.collection.unknown ?? 0}
              </span>
            )}
          </div>
          <div className="op-summary-visual-slot">
            {summary.collection.collectors?.length > 0 ? (
              <div className="op-collector-dots" aria-label="수집기별 현재 상태 분포">
                {summary.collection.collectors.map((c: any) => (
                  <span
                    key={c.id}
                    className={`op-collector-dot is-${c.severity}`}
                    title={`${c.label}: ${{ok:'정상',pending:'보류',processing:'진행 중',problem:'이상',observation_error:'상태 조회 실패',unknown:'미확인'}[c.key as string] ?? '미확인'}`}
                  />
                ))}
              </div>
            ) : (
              <div className="op-spark-unavailable">
                <span>상태 미확인</span>
              </div>
            )}
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
            <span className="op-summary-sub">7일 문서 추세</span>
          </div>
          <ArrowRight size={13} className="op-summary-arrow" aria-hidden="true" />
        </div>
        <div className="op-summary-body">
          <div className="op-summary-value-row">
            <div className="op-summary-value">
              <span className="op-summary-val-main">{summary.rag.matchedLabel}</span>
              {summary.rag.state === 'ready' && <span className="op-summary-val-unit">과제</span>}
            </div>
            {summary.rag.state === 'ready' && (
              <span className="op-summary-val-sub">
                문서 {summary.rag.docsLabel}
              </span>
            )}
          </div>
          <div className="op-summary-visual-slot">
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
            <span className="op-summary-sub">서버 응답</span>
          </div>
          <ArrowRight size={13} className="op-summary-arrow" aria-hidden="true" />
        </div>
        <div className="op-summary-body">
          <div className="op-summary-value-row">
            <div className="op-summary-value">
              <span className="op-summary-val-main">{summary.models.label}</span>
              {summary.models.state === 'ready' && <span className="op-summary-val-unit">서버</span>}
            </div>
          </div>
          {summary.models.hosts.length > 0 ? (
            <div className="op-models-list">
              {summary.models.hosts.map((h: any) => (
                <div className="op-models-row" key={h.id}>
                  <div className="op-models-item-left">
                    <span className={`op-host-dot is-${h.severity}`} aria-hidden="true" />
                    <span>{h.label}</span>
                  </div>
                  <span className={`op-models-status is-${h.severity}`}>{h.stateText}</span>
                </div>
              ))}
            </div>
          ) : (
            <span className="op-summary-val-sub">서버 응답 미확인</span>
          )}
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
            <span className="op-summary-sub">조치 대상</span>
          </div>
          <ArrowRight size={13} className="op-summary-arrow" aria-hidden="true" />
        </div>
        <div className="op-summary-body">
          <div className="op-summary-value-row">
            <div className="op-summary-value">
              <span className="op-summary-val-main">{summary.issues.label}</span>
              {summary.issues.label !== '—' && <span className="op-summary-val-unit">건</span>}
            </div>
          </div>
          {summary.issues.brokenNodes?.length > 0 ? (
            <div className="op-issues-visual-list">
              <div className="op-issues-pictogram" aria-label="점검 대상 현황">
                {summary.issues.brokenNodes.map((n: any) => (
                  <span
                    key={n.id}
                    className={`op-issue-dot is-${n.severity}`}
                    title={`${n.label} (${n.type === 'host' ? '호스트' : '노드'})`}
                  />
                ))}
              </div>
              <div className="op-issues-top">
                {summary.issues.topItems.map((item: any) => (
                  <span className="op-issues-item" key={item.id}>
                    · {item.label}
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <div className="op-issues-normal-state">
              <div className="op-issue-clear-dot" style={{color:summary.issues.countsKnown ? 'var(--green)' : 'var(--muted)'}}>
                <i className={`op-summary-dot is-${summary.issues.countsKnown ? 'ok' : 'idle'}`} />
                <span>{summary.issues.countsKnown ? '조치 대상 없음' : '상태 미확인'}</span>
              </div>
              <span className="op-summary-val-sub">
                {summary.issues.countsKnown
                  ? '현재 관측된 점검 항목 없음'
                  : '관측 범위 확인 필요'}
              </span>
            </div>
          )}
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

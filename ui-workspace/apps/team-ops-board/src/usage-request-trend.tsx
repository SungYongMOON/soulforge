import {useState} from 'react';
import './usage-request-trend.css';

type Row = Record<string, any>;

interface UsageRequestTrendProps {
  unmeasuredDaily: Row[];
  range: 7 | 30;
  collectorStatus?: { key?: string; observedAt?: string | null };
}

export function UsageRequestTrend({ unmeasuredDaily, range, collectorStatus }: UsageRequestTrendProps) {
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);

  const isCollectorDown = collectorStatus && collectorStatus.key && collectorStatus.key !== 'ok';
  const hasDaily = Array.isArray(unmeasuredDaily) && unmeasuredDaily.length > 0;

  if (!hasDaily) {
    return (
      <div className="ag-req-trend">
        <div className="ag-req-trend-head">
          <div className="ag-req-trend-title">
            <strong>Antigravity 요청</strong>
            <small>토큰 미측정</small>
          </div>
          {isCollectorDown && (
            <span className="ag-req-trend-warning">수집기 상태 확인 필요</span>
          )}
        </div>
        <p className="ag-req-empty">Antigravity 요청 이력 조회 불가</p>
        <p className="ag-req-trend-caption">요청 기록 · 대화 관측일 기준 · 토큰 별도</p>
      </div>
    );
  }

  const sliced = unmeasuredDaily.slice(-range);
  const geminiVals = sliced.map(d => d.families?.find((f: any) => f.family_id === 'ag_gemini')?.requests ?? 0);
  const claudeGptVals = sliced.map(d => d.families?.find((f: any) => f.family_id === 'ag_claude_gpt')?.requests ?? 0);

  const geminiTotal = geminiVals.reduce((a, b) => a + b, 0);
  const claudeGptTotal = claudeGptVals.reduce((a, b) => a + b, 0);

  const maxVal = Math.max(...geminiVals, ...claudeGptVals, 1);

  const activeIdx = selectedIdx !== null && selectedIdx<sliced.length ? selectedIdx : sliced.length - 1;
  const activeDay = sliced[activeIdx];
  const activeGemini = geminiVals[activeIdx] ?? 0;
  const activeClaudeGpt = claudeGptVals[activeIdx] ?? 0;

  const activeGeminiModels: Row[] = activeDay?.families?.find((f: any) => f.family_id === 'ag_gemini')?.models ?? [];
  const activeClaudeGptModels: Row[] = activeDay?.families?.find((f: any) => f.family_id === 'ag_claude_gpt')?.models ?? [];

  return (
    <div className="ag-req-trend" aria-label="Antigravity 요청 추이">
      <div className="ag-req-trend-head">
        <div className="ag-req-trend-title">
          <strong>Antigravity 요청</strong>
          <small>최근 {range}일 · 토큰 미측정</small>
        </div>
        <div className="ag-req-trend-pills">
          <span className="ag-req-family-pill">
            <span className="ag-req-dot is-gemini" />
            <span>Gemini</span>
            <strong>{geminiTotal.toLocaleString('ko-KR')}회</strong>
          </span>
          <span className="ag-req-family-pill">
            <span className="ag-req-dot is-claude-gpt" />
            <span>Claude+GPT</span>
            <strong>{claudeGptTotal.toLocaleString('ko-KR')}회</strong>
          </span>
        </div>
        {isCollectorDown && (
          <span className="ag-req-trend-warning" title={collectorStatus?.observedAt ? `마지막 관측: ${collectorStatus.observedAt}` : undefined}>
            최근 수집 상태 확인 필요
          </span>
        )}
      </div>

      <div className="ag-req-plot-wrap">
        <div className="ag-req-plot" role="group" aria-label="일자별 Antigravity 요청 분포">
          {sliced.map((day, i) => {
            const gReq = geminiVals[i];
            const cgReq = claudeGptVals[i];
            const gHeight = Math.max(gReq > 0 ? (gReq / maxVal) * 100 : 0, 0);
            const cgHeight = Math.max(cgReq > 0 ? (cgReq / maxVal) * 100 : 0, 0);
            const isSel = activeIdx === i;

            return (
              <button
                key={day.date ?? i}
                type="button"
                className={`ag-req-bar-group ${isSel ? 'is-active' : ''}`}
                onClick={() => setSelectedIdx(i === selectedIdx ? null : i)}
                onFocus={() => setSelectedIdx(i)}
                aria-label={`${day.date}: Gemini ${gReq}회, Claude+GPT ${cgReq}회`}
              >
                <i
                  className={`ag-req-bar is-gemini ${gReq === 0 ? 'is-zero' : ''}`}
                  style={{ height: `${gHeight}%` }}
                />
                <i
                  className={`ag-req-bar is-claude-gpt ${cgReq === 0 ? 'is-zero' : ''}`}
                  style={{ height: `${cgHeight}%` }}
                />
              </button>
            );
          })}
        </div>
      </div>

      <div className="ag-req-selection-box">
        <span className="ag-req-selection-date">{activeDay ? String(activeDay.date).slice(5).replace('-', '/') : ''}</span>
        <span className="ag-req-selection-val">
          <span className="ag-req-dot is-gemini" />
          <b>{activeGemini.toLocaleString('ko-KR')}회</b>
          {activeGeminiModels.length > 0 && (
            <small>({activeGeminiModels.map(m => `${m.model_id}: ${m.requests}회`).join(', ')})</small>
          )}
        </span>
        <span className="ag-req-selection-val">
          <span className="ag-req-dot is-claude-gpt" />
          <b>{activeClaudeGpt.toLocaleString('ko-KR')}회</b>
          {activeClaudeGptModels.length > 0 && (
            <small>({activeClaudeGptModels.map(m => `${m.model_id}: ${m.requests}회`).join(', ')})</small>
          )}
        </span>
        <span className="ag-req-trend-caption">대화 관측일 기준 · 토큰 별도</span>
      </div>
    </div>
  );
}

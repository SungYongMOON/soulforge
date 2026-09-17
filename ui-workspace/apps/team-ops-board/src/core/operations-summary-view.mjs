import {dashboardQuotas,dashboardWork} from './operations-dashboard-view.mjs';
import {ragOverview} from './operations-overview-view.mjs';
import {ragTrend} from './rag-trend.mjs';
import {chartPeriod} from './chart-period.mjs';

function formatKoreanTokens(tokens) {
  if (typeof tokens !== 'number' || !Number.isFinite(tokens) || tokens < 0) return '—';
  if (tokens === 0) return '0';
  if (tokens >= 100000000) {
    const eok = tokens / 100000000;
    const formatted = Number(eok.toFixed(1));
    return `${formatted}억`;
  }
  if (tokens >= 10000) {
    const man = tokens / 10000;
    const formatted = Number(man.toFixed(1));
    return `${formatted}만`;
  }
  return tokens.toLocaleString('ko-KR');
}

export function projectQuotaSummary(inputs = {}, failed = []) {
  const rows = dashboardQuotas(inputs, failed);
  const groups = new Map();
  for (const r of rows) {
    if (!groups.has(r.provider)) groups.set(r.provider, []);
    groups.get(r.provider).push(r);
  }

  const providers = [];
  let anyUnknown = false;
  let allUnknown = true;

  for (const [provider, items] of groups.entries()) {
    const currentItems = items.filter(i => i.current && typeof i.remaining === 'number' && Number.isFinite(i.remaining));
    if (!currentItems.length) {
      anyUnknown = true;
      providers.push({
        provider,
        window: items[0]?.window ?? '한도',
        remaining: null,
        current: false,
        severity: 'idle',
      });
    } else {
      allUnknown = false;
      if (currentItems.length < items.length) anyUnknown = true;
      const minItem = currentItems.reduce((lowest, item) => (item.remaining < lowest.remaining ? item : lowest), currentItems[0]);
      const severity = minItem.remaining < 10 ? 'crit' : minItem.remaining < 25 ? 'warn' : 'ok';
      providers.push({
        provider,
        window: minItem.window,
        remaining: Math.round(minItem.remaining),
        current: true,
        severity,
      });
    }
  }

  return {
    providers,
    anyUnknown: providers.length > 0 && anyUnknown,
    allUnknown: providers.length === 0 || allUnknown,
  };
}

export function projectTokenSummary(inputs = {}, failed = []) {
  if (failed.includes('usage') || !inputs.usage?.history) {
    return {
      state: 'unavailable',
      label: '—',
      unit: '',
      hasPartial: false,
      todayTokens: null,
      coverageText: '조회 실패',
    };
  }

  const modelDaily = Array.isArray(inputs.usage.history.model_daily)
    ? inputs.usage.history.model_daily
    : [];

  if (!modelDaily.length) {
    return {
      state: 'unavailable',
      label: '—',
      unit: '',
      hasPartial: false,
      todayTokens: null,
      coverageText: '기록 없음',
    };
  }

  const dated = modelDaily.filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d?.date ?? '')).sort((a,b)=>a.date.localeCompare(b.date));
  const days = chartPeriod(7, `${dated.at(-1)?.date}T12:00:00+09:00`);
  const byDate = new Map(dated.map(d => [d.date,d]));
  const sliced = days.map(d => byDate.get(d.key) ?? {date:d.key,models:null});
  let totalTokens = 0;
  let hasValidToken = false;
  let totalUnknownTurns = 0;
  let missingOrInvalidValue = sliced.length < 7;

  for (const day of sliced) {
    if (!Array.isArray(day?.models)) {
      missingOrInvalidValue = true;
      continue;
    }
    for (const m of day.models) {
      if (typeof m?.total_tokens === 'number' && Number.isFinite(m.total_tokens) && m.total_tokens >= 0) {
        totalTokens += m.total_tokens;
        hasValidToken = true;
      } else {
        missingOrInvalidValue = true;
      }
      if (typeof m?.token_unknown_turns === 'number' && m.token_unknown_turns > 0) {
        totalUnknownTurns += m.token_unknown_turns;
      }
    }
  }

  const unmeasuredDaily = Array.isArray(inputs.usage.history.unmeasured_request_daily)
    ? inputs.usage.history.unmeasured_request_daily.slice(-7)
    : [];
  let agRequests = 0;
  for (const day of unmeasuredDaily) {
    if (Array.isArray(day?.families)) {
      for (const f of day.families) {
        if (typeof f?.requests === 'number' && f.requests > 0) {
          agRequests += f.requests;
        }
      }
    }
  }

  const coverageState = inputs.usage.history.codex_activity_coverage?.state;
  const hasPartial = totalUnknownTurns > 0 || coverageState === 'partial' || agRequests > 0 || missingOrInvalidValue;

  let todayTokens = null;
  const todayKst = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
  const todayRow = sliced.find(d => d?.date === todayKst);
  if (todayRow && Array.isArray(todayRow.models)) {
    let dayTokens = 0;
    let dayHasValid = false;
    for (const m of todayRow.models) {
      if (typeof m?.total_tokens === 'number' && Number.isFinite(m.total_tokens) && m.total_tokens >= 0) {
        dayTokens += m.total_tokens;
        dayHasValid = true;
      }
    }
    if (dayHasValid) {
      todayTokens = formatKoreanTokens(dayTokens);
    }
  }

  const sparkline = sliced.map(d => {
    if (!Array.isArray(d?.models)) return { date: d?.date ?? null, value: null };
    let sum = 0;
    let valid = false;
    for (const m of d.models) {
      if (typeof m?.total_tokens === 'number' && Number.isFinite(m.total_tokens) && m.total_tokens >= 0) {
        sum += m.total_tokens;
        valid = true;
      }
    }
    return { date: d?.date ?? null, value: valid ? sum : null };
  });

  return {
    state: hasValidToken ? 'ready' : 'unavailable',
    tokens: hasValidToken ? totalTokens : null,
    label: hasValidToken ? formatKoreanTokens(totalTokens) : '—',
    hasPartial,
    todayTokens,
    sparkline,
  };
}

export function projectCollectionSummary(model = {}, failed = []) {
  const healthAvailable = Boolean(model.healthAvailable) && !failed.includes('health');
  if (!healthAvailable || !Array.isArray(model.nodes)) {
    return {
      state: 'unavailable',
      label: '—',
      normal: null,
      total: null,
      pending: null,
      unknown: null,
      processing: null,
      problem: null,
      collectors: [],
      severity: 'idle',
    };
  }

  const collectors = model.nodes.filter(n =>
    n?.stage === 'collect' &&
    typeof n?.id === 'string' &&
    n.id.startsWith('watchtower::') &&
    !n.id.startsWith('watchtower::src_')
  );

  const total = collectors.length;
  if (total === 0) {
    return {
      state: 'unavailable',
      label: '—',
      normal: 0,
      total: 0,
      pending: 0,
      unknown: 0,
      processing: 0,
      problem: 0,
      collectors: [],
      severity: 'idle',
    };
  }

  const normal = collectors.filter(n => n.status?.key === 'ok').length;
  const pending = collectors.filter(n => n.status?.key === 'pending').length;
  const unknown = collectors.filter(n => n.status?.key === 'unknown').length;
  const processing = collectors.filter(n => n.status?.key === 'processing').length;
  const problem = collectors.filter(n => n.status?.key === 'problem').length;
  const observationError = collectors.filter(n => n.status?.key === 'observation_error').length;

  const collectorItems = collectors.map(c => {
    const key = c.status?.key ?? 'unknown';
    const isOk = key === 'ok';
    const isProb = key === 'problem';
    const isProc = key === 'processing';
    const isPend = key === 'pending';
    const severity = isOk ? 'ok' : isProb ? 'crit' : isProc || isPend ? 'pending' : key === 'observation_error' ? 'crit' : 'unknown';
    return {
      id: c.id,
      label: c.label ?? c.id,
      key,
      severity,
    };
  });

  let severity = 'ok';
  if (problem > 0) {
    severity = 'crit';
  } else if (observationError > 0 || pending > 0 || unknown > 0 || processing > 0 || normal < total) {
    severity = 'warn';
  }

  return {
    state: 'ready',
    label: `${normal} / ${total}`,
    normal,
    total,
    pending,
    unknown,
    processing,
    problem,
    observationError,
    collectors: collectorItems,
    severity,
  };
}

export function projectRagSummary(inputs = {}, failed = []) {
  const current = inputs.rag?.state === 'ready' && !failed.includes('rag');
  if (!current) {
    return {
      state: 'unavailable',
      matchedLabel: '—',
      docsLabel: '—',
      chunksLabel: '—',
      pendingLabel: '—',
      sparkline: [],
      severity: 'idle',
    };
  }

  const overview = ragOverview(inputs.rag);
  const matched = overview.matched;
  const expected = overview.expected;

  const trendResult = Array.isArray(inputs.rag.projects)
    ? ragTrend(inputs.rag.projects, inputs.rag.expected ?? expected, 7, inputs.rag.observed_at)
    : { points: [] };
  const sparkline = (trendResult.points ?? []).map(p => ({
    label: p.label,
    at: p.at,
    value: p.documents, // stock observation of documents; null if missing/incomplete
  }));

  if (expected === 0) {
    return {
      state: 'ready',
      matched: 0,
      expected: 0,
      matchedLabel: '0 / 0',
      docsLabel: '—',
      chunksLabel: '—',
      pendingLabel: '—',
      sparkline,
      severity: 'idle',
    };
  }

  const fmtAmount = metric => {
    if (metric.value === null) return '—';
    const numStr = metric.value.toLocaleString('ko-KR');
    return metric.complete ? numStr : `≥ ${numStr}`;
  };

  const docsLabel = fmtAmount(overview.documents);
  const chunksLabel = fmtAmount(overview.chunks);
  const pendingLabel = fmtAmount(overview.pending);

  const isComplete = expected > 0 && matched === expected;
  const severity = isComplete ? 'ok' : matched === 0 && expected > 0 ? 'crit' : 'warn';

  return {
    state: 'ready',
    matched,
    expected,
    matchedLabel: `${matched} / ${expected}`,
    docsLabel,
    chunksLabel,
    pendingLabel,
    sparkline,
    severity,
  };
}

export function projectModelsSummary(inputs = {}, failed = []) {
  const current = inputs.models?.state === 'ready' && !failed.includes('models');
  if (!current) {
    return {
      state: 'unavailable',
      label: '—',
      respondingCount: null,
      totalHosts: null,
      hosts: [],
      severity: 'idle',
    };
  }

  const hosts = Array.isArray(inputs.models?.hosts) ? inputs.models.hosts : [];
  const totalHosts = hosts.length;
  if (totalHosts === 0) {
    return {
      state: 'unavailable',
      label: '—',
      respondingCount: null,
      totalHosts: 0,
      hosts: [],
      severity: 'idle',
    };
  }

  const respondingHosts = hosts.filter(h => h.connection === 'responding');
  const respondingCount = respondingHosts.length;

  const hostSummaries = hosts.map(h => {
    const shortLabel = h.id === 'gpu-response' ? 'GPU PC' : h.id === 'local-ollama' ? 'PC Ollama' : (h.label ?? '').replace(' · RAG 모델', '').replace(' · 응답 모델', '');
    const isResponding = h.connection === 'responding';
    const isRefused = h.connection === 'refused';
    const isTimeout = h.connection === 'timeout';
    const stateText = isResponding ? '정상' : isRefused ? '거부' : isTimeout ? '지연' : '미확인';
    const severity = isResponding ? 'ok' : isRefused ? 'crit' : 'warn';
    return {
      id: h.id,
      label: shortLabel,
      stateText,
      severity,
      connection: h.connection,
    };
  });

  const hasRefused = hostSummaries.some(h => h.connection === 'refused');
  const hasTimeout = hostSummaries.some(h => h.connection === 'timeout');
  const allResponding = totalHosts > 0 && respondingCount === totalHosts;
  const severity = hasRefused ? 'crit' : (!allResponding || hasTimeout) ? 'warn' : 'ok';

  return {
    state: 'ready',
    label: `${respondingCount} / ${totalHosts}`,
    respondingCount,
    totalHosts,
    hosts: hostSummaries,
    severity,
  };
}

export function projectIssuesSummary(model = {}, inputs = {}, failed = []) {
  const healthKnown = Boolean(model.healthAvailable) && !failed.includes('health');
  const modelsKnown = inputs.models?.state === 'ready' && !failed.includes('models');
  const countsKnown = healthKnown && modelsKnown;

  const watched = (healthKnown && Array.isArray(model.attention)) ? model.attention : [];
  const hosts = modelsKnown ? (inputs.models?.hosts ?? []) : [];
  const brokenHosts = hosts.filter(h => ['refused', 'timeout'].includes(h.connection));

  const totalCount = watched.length + brokenHosts.length;
  const unknownCount = (healthKnown && typeof model.counts?.unknown === 'number')
    ? model.counts.unknown
    : null;

  const topItems = [];
  for (const h of brokenHosts) {
    const name = h.id === 'gpu-response' ? 'GPU PC' : h.id === 'local-ollama' ? 'PC Ollama' : (h.label ?? '').replace(' · RAG 모델', '').replace(' · 응답 모델', '');
    topItems.push({ id: h.id, label: `${name} ${h.connection === 'refused' ? '접속 거부' : '지연'}` });
    if (topItems.length >= 2) break;
  }
  if (topItems.length < 2) {
    for (const n of watched) {
      const name = n.id === 'watchtower::ingress_supervisor' ? 'PLAUD 수집' : n.label;
      topItems.push({ id: n.id, label: name });
      if (topItems.length >= 2) break;
    }
  }

  let label = '—';
  if (countsKnown) {
    label = `${totalCount}`;
  } else if (totalCount > 0) {
    label = `≥ ${totalCount}`;
  }

  const severity = totalCount > 0 ? 'crit' : (!countsKnown || (unknownCount !== null && unknownCount > 0)) ? 'warn' : 'ok';

  const brokenNodes = [
    ...brokenHosts.map(h => ({
      id: h.id,
      label: h.id === 'gpu-response' ? 'GPU PC' : h.id === 'local-ollama' ? 'PC Ollama' : (h.label ?? '').replace(' · RAG 모델', '').replace(' · 응답 모델', ''),
      type: 'host',
      severity: h.connection === 'refused' ? 'crit' : 'warn',
    })),
    ...watched.map(n => ({
      id: n.id,
      label: n.id === 'watchtower::ingress_supervisor' ? 'PLAUD 수집' : (n.label ?? n.id),
      type: 'node',
      severity: n.status?.key === 'problem' || n.status?.key === 'observation_error' ? 'crit' : 'warn',
    })),
  ];

  return {
    countsKnown,
    totalCount,
    label,
    unknownCount,
    topItems,
    brokenNodes,
    severity,
  };
}

export function buildOperationsSummaryView(inputs = {}, failed = [], model = {}) {
  const quotas = projectQuotaSummary(inputs, failed);
  const tokens = projectTokenSummary(inputs, failed);
  const collection = projectCollectionSummary(model, failed);
  const rag = projectRagSummary(inputs, failed);
  const models = projectModelsSummary(inputs, failed);
  const issues = projectIssuesSummary(model, inputs, failed);

  let workActivity = null;
  const work = dashboardWork(inputs, failed);
  if (work.complete && work.rows.length > 0) {
    workActivity = `${work.rows.length}개 활성`;
  }

  return {
    quotas,
    tokens,
    collection,
    rag,
    models: { ...models, workActivity },
    issues,
  };
}

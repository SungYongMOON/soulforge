const OBSERVATION_GAP_STATUSES = new Set(["stopped", "not_loaded_unknown", "error"]);

export const REALTIME_STATUS_COPY = Object.freeze({
  active: Object.freeze({
    label: "실행 중",
    description: "명시적 실행 이벤트가 관측된 작업",
    tone: "active"
  }),
  waiting: Object.freeze({
    label: "입력·승인 대기",
    description: "입력 또는 승인을 명시적으로 기다리는 작업",
    tone: "waiting"
  }),
  owner_result: Object.freeze({
    label: "결과 확인",
    description: "Owner에게 명시적으로 전달된 결과 gate",
    tone: "result"
  }),
  stopped: Object.freeze({
    label: "응답 종료",
    description: "마지막 응답/turn 종료 관측 · TASK 완료 아님",
    tone: "stopped"
  }),
  unknown: Object.freeze({
    label: "상태 신호 없음",
    description: "등록됐지만 실행·대기·결과를 판정할 최신 정확 신호 없음",
    tone: "unknown"
  }),
  unavailable: Object.freeze({
    label: "비활성·미확인",
    description: "응답 종료 또는 최신 상태를 정확히 확인할 수 없는 등록 항목",
    tone: "unavailable"
  })
});

const ADAPTER_HEALTH_COPY = Object.freeze({
  ready: "시스템 정상",
  partial: "어댑터 부분 관측",
  unavailable: "어댑터 연결 불가",
  error: "어댑터 관측 오류",
  disabled: "어댑터 중지"
});

// The empty fail-closed projection is a transport fallback, not evidence that
// the adapter failed.  Keep the first request visibly distinct so a browser
// never presents its placeholder 0/0 values as an observed runtime state.
export function liveProjectionLoadPresentation({ initialPending = false, adapter = null } = {}) {
  if (initialPending === true) {
    return {
      state: "initial_loading",
      label: "실시간 현황 불러오는 중",
      should_render_projection: false
    };
  }
  const health = typeof adapter?.health === "string" ? adapter.health : "unavailable";
  return {
    state: ["unavailable", "error", "disabled"].includes(health) ? "failure" : "ready",
    label: ADAPTER_HEALTH_COPY[health] ?? "어댑터 상태 미확정",
    should_render_projection: true
  };
}

function isSuccessfulLiveProjection(projection) {
  return ["ready", "partial"].includes(projection?.adapter?.health)
    && projection?.scope?.lifecycle_source_health !== "hold";
}

export function isOrganizationUsageAttributionReady(projection) {
  return isSuccessfulLiveProjection(projection);
}

function isTransientLifecycleRefresh(projection) {
  return projection?.adapter?.health === "partial"
    && projection?.scope?.lifecycle_source_health === "hold";
}

// A completed transport error is meaningful on the first read, but it must
// not erase an already validated projection during a later poll or manual
// refresh.  The caller renders the retained observation unchanged and marks
// the refresh as stale instead.
export function resolveLiveProjectionRefresh({ lastSuccessfulProjection = null, nextProjection = null } = {}) {
  if (isSuccessfulLiveProjection(nextProjection)) {
    return {
      projection: nextProjection,
      refresh_failure: null,
      retained_last_good: false,
      accepted_success: true
    };
  }
  const nextHealth = typeof nextProjection?.adapter?.health === "string" ? nextProjection.adapter.health : "error";
  if (
    isSuccessfulLiveProjection(lastSuccessfulProjection)
    && (["unavailable", "error"].includes(nextHealth) || isTransientLifecycleRefresh(nextProjection))
  ) {
    return {
      projection: lastSuccessfulProjection,
      refresh_failure: isTransientLifecycleRefresh(nextProjection) ? "lifecycle_hold" : nextHealth,
      retained_last_good: true,
      accepted_success: false
    };
  }
  return {
    projection: nextProjection,
    refresh_failure: null,
    retained_last_good: false,
    accepted_success: false
  };
}

function exactThreadId(value) {
  return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9_.-]{0,319}$/u.test(value)
    ? value
    : null;
}

function sortedThreads(threads) {
  return [...threads].sort((left, right) => (
    String(right?.updated_at ?? "").localeCompare(String(left?.updated_at ?? ""))
    || String(left?.thread_id ?? "").localeCompare(String(right?.thread_id ?? ""))
  ));
}

// This is deliberately a presentation-only partition. It never converts a raw
// idle/notLoaded observation into a result and never promotes parent delivery
// to Owner attention. Exact stopped-turn routing is resolved upstream.
export function buildRealtimeStatusBuckets(threadsInput, ownerThreadsInput = []) {
  const threads = Array.isArray(threadsInput) ? threadsInput.filter((thread) => exactThreadId(thread?.thread_id)) : [];
  const byId = new Map(threads.map((thread) => [thread.thread_id, thread]));
  const ownerIds = new Set(
    (Array.isArray(ownerThreadsInput) ? ownerThreadsInput : [])
      .filter((thread) => (
        exactThreadId(thread?.thread_id)
        && thread.status === "owner_attention"
        && thread.attention_target === "owner"
        && byId.has(thread.thread_id)
      ))
      .map((thread) => thread.thread_id)
  );
  const buckets = {
    active: [],
    waiting: [],
    owner_result: [],
    unavailable: [],
    parent_result: []
  };
  for (const thread of threads) {
    if (thread.status === "active") buckets.active.push(thread);
    else if (thread.status === "waiting") buckets.waiting.push(thread);
    else if (ownerIds.has(thread.thread_id)) buckets.owner_result.push(thread);
    else if (thread.status === "parent_result_ready" && thread.attention_target === "parent") buckets.parent_result.push(thread);
    else if (OBSERVATION_GAP_STATUSES.has(thread.status)) buckets.unavailable.push(thread);
  }
  return Object.fromEntries(Object.entries(buckets).map(([key, value]) => [key, sortedThreads(value)]));
}

export function splitObservationGap(threadsInput) {
  const threads = Array.isArray(threadsInput) ? threadsInput : [];
  return {
    stopped: threads.filter((thread) => thread?.status === "stopped").length,
    unknown: threads.filter((thread) => ["not_loaded_unknown", "error"].includes(thread?.status)).length
  };
}

export function observationGapBreakdown(threadsInput) {
  const threads = Array.isArray(threadsInput) ? threadsInput : [];
  return {
    stopped: threads.filter((thread) => thread?.status === "stopped").length,
    not_loaded_unknown: threads.filter((thread) => thread?.status === "not_loaded_unknown").length,
    error: threads.filter((thread) => thread?.status === "error").length
  };
}

export function realtimeStatusCopy(key) {
  return REALTIME_STATUS_COPY[key] ?? REALTIME_STATUS_COPY.unavailable;
}

// Adapter health and structural coverage are deliberately reported separately.
// A healthy adapter can still have partial exact-ID coverage.
export function formatRealtimeCoverage(adapterInput, scopeInput) {
  const adapter = adapterInput && typeof adapterInput === "object" ? adapterInput : {};
  const scope = scopeInput && typeof scopeInput === "object" ? scopeInput : {};
  const matched = Number.isSafeInteger(scope.lifecycle_matched_enrolled_count)
    && scope.lifecycle_matched_enrolled_count >= 0
    ? scope.lifecycle_matched_enrolled_count
    : 0;
  const exact = Number.isSafeInteger(scope.lifecycle_exact_identity_count)
    && scope.lifecycle_exact_identity_count >= 0
    ? scope.lifecycle_exact_identity_count
    : 0;
  const coverage = adapter.coverage === "partial"
    || (exact > 0 && matched < exact)
    ? "부분 관측"
    : adapter.coverage === "exact" || (exact > 0 && matched === exact)
      ? "전체 관측"
      : "관측 범위 미확정";
  const health = ADAPTER_HEALTH_COPY[adapter.health] ?? "어댑터 상태 미확정";
  return `${health} · 구조 신호 ${matched}/${exact} (${coverage})`;
}

export function paginateExactItems(itemsInput, pageInput = 0, pageSizeInput = 6) {
  const items = Array.isArray(itemsInput) ? itemsInput : [];
  const pageSize = Number.isSafeInteger(pageSizeInput) && pageSizeInput > 0 ? Math.min(pageSizeInput, 24) : 6;
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const page = Number.isSafeInteger(pageInput) ? Math.min(Math.max(pageInput, 0), pageCount - 1) : 0;
  return {
    items: items.slice(page * pageSize, (page + 1) * pageSize),
    page,
    page_count: pageCount,
    total: items.length
  };
}

export function countSemanticStatuses(threadsInput, ownerThreadsInput = []) {
  const buckets = buildRealtimeStatusBuckets(threadsInput, ownerThreadsInput);
  return Object.fromEntries(Object.entries(buckets).map(([key, value]) => [key, value.length]));
}

function usageMetric(rowInput) {
  const row = rowInput && typeof rowInput === "object" ? rowInput : {};
  return {
    turns: Number.isSafeInteger(row.turns) && row.turns >= 0 ? row.turns : 0,
    total_tokens: Number.isSafeInteger(row.total_tokens) && row.total_tokens >= 0 ? row.total_tokens : 0,
    credits: typeof row.credits === "number" && Number.isFinite(row.credits) && row.credits >= 0 ? row.credits : 0,
    credit_unknown_turns: Number.isSafeInteger(row.credit_unknown_turns) && row.credit_unknown_turns >= 0
      ? row.credit_unknown_turns
      : 0
  };
}

function addUsageMetric(left, rightInput) {
  const right = usageMetric(rightInput);
  return {
    turns: left.turns + right.turns,
    total_tokens: left.total_tokens + right.total_tokens,
    credits: left.credits + right.credits,
    credit_unknown_turns: left.credit_unknown_turns + right.credit_unknown_turns
  };
}

function hasUsage(metric) {
  return metric.turns > 0 || metric.total_tokens > 0 || metric.credits > 1e-9 || metric.credit_unknown_turns > 0;
}

function usageRowComparator(left, right) {
  return right.total_tokens - left.total_tokens
    || right.credits - left.credits
    || right.turns - left.turns
    || left.usage_id.localeCompare(right.usage_id, "ko");
}

function compactUsageRows(rowsInput, limitInput, otherRow) {
  const rows = [...rowsInput].sort(usageRowComparator);
  const limit = Number.isSafeInteger(limitInput) && limitInput > 0 ? limitInput : 5;
  const visible = rows.slice(0, limit);
  const overflow = rows.slice(limit).reduce(
    (total, row) => addUsageMetric(total, row),
    usageMetric(otherRow)
  );
  if (hasUsage(overflow)) visible.push({ ...otherRow, ...overflow });
  return visible.sort(usageRowComparator);
}

export function buildProjectUsageChartRows(breakdownInput, limit = 5) {
  const breakdown = breakdownInput && typeof breakdownInput === "object" ? breakdownInput : {};
  const rows = (Array.isArray(breakdown.top) ? breakdown.top : [])
    .filter((row) => typeof row?.project_id === "string" && row.project_id.length > 0)
    .map((row) => ({
      usage_id: row.project_id,
      label: row.project_id === "unassigned" ? "미분류 프로젝트" : row.project_id,
      secondary: row.project_id,
      ...usageMetric(row)
    }))
    .filter(hasUsage);
  return compactUsageRows(rows, limit, {
    usage_id: "other_projects",
    label: "기타 프로젝트",
    secondary: "상위 목록 밖 집계",
    ...usageMetric(breakdown.other)
  });
}

export function buildOrganizationUsageChartRows(taskBreakdownInput, exactTaskAttributionInput, limit = 6) {
  const breakdown = taskBreakdownInput && typeof taskBreakdownInput === "object" ? taskBreakdownInput : {};
  const exactTaskAttribution = exactTaskAttributionInput instanceof Map ? exactTaskAttributionInput : new Map();
  const groups = new Map();
  const addToGroup = (usageId, label, metricInput) => {
    const current = groups.get(usageId) ?? {
      usage_id: usageId,
      label,
      secondary: usageId,
      ...usageMetric(null)
    };
    groups.set(usageId, { ...current, ...addUsageMetric(current, metricInput) });
  };

  for (const row of Array.isArray(breakdown.top) ? breakdown.top : []) {
    if (typeof row?.task_id !== "string" || row.task_id.length === 0) continue;
    const exact = exactTaskAttribution.get(row.task_id);
    if (typeof exact?.organization_group_id === "string" && exact.organization_group_id.length > 0) {
      addToGroup(
        exact.organization_group_id,
        typeof exact.organization_label === "string" && exact.organization_label.length > 0
          ? exact.organization_label
          : exact.organization_group_id,
        row
      );
    } else {
      addToGroup("unlinked_other", "미연결·기타", row);
    }
  }
  if (hasUsage(usageMetric(breakdown.other))) {
    addToGroup("unlinked_other", "미연결·기타", breakdown.other);
  }

  return compactUsageRows(
    [...groups.values()].filter(hasUsage),
    limit,
    {
      usage_id: "other_organizations",
      label: "그 외 조직",
      secondary: "표시 상위 밖 집계",
      ...usageMetric(null)
    }
  );
}

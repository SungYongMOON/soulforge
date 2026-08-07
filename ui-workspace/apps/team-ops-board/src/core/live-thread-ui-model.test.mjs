import assert from "node:assert/strict";
import test from "node:test";

import {
  buildOrganizationUsageChartRows,
  buildProjectUsageChartRows,
  buildRealtimeStatusBuckets,
  countSemanticStatuses,
  formatRealtimeCoverage,
  isOrganizationUsageAttributionReady,
  liveProjectionLoadPresentation,
  observationGapBreakdown,
  paginateExactItems,
  realtimeStatusCopy,
  resolveLiveProjectionRefresh,
  splitObservationGap
} from "./live-thread-ui-model.mjs";

function thread(thread_id, status, attention_target = "none") {
  return { thread_id, status, attention_target, updated_at: "2026-08-04T01:00:00.000Z" };
}

test("real-time semantic buckets keep an exact Owner response/turn-end confirmation without changing unrelated active work", () => {
  const threads = [
    thread("exact-active", "active"),
    thread("exact-waiting", "waiting"),
    thread("exact-owner", "owner_attention", "owner"),
    thread("exact-parent", "parent_result_ready", "parent"),
    thread("exact-stopped", "stopped"),
    thread("exact-unknown", "not_loaded_unknown")
  ];
  const buckets = buildRealtimeStatusBuckets(threads, [
    thread("exact-owner", "owner_attention", "owner"),
    thread("exact-parent", "parent_result_ready", "parent"),
    thread("not-enrolled", "owner_attention", "owner")
  ]);

  assert.deepEqual(countSemanticStatuses(threads, [thread("exact-owner", "owner_attention", "owner")]), {
    active: 1,
    waiting: 1,
    owner_result: 1,
    unavailable: 2,
    parent_result: 1
  });
  assert.deepEqual(buckets.owner_result.map((item) => item.thread_id), ["exact-owner"]);
  assert.deepEqual(buckets.parent_result.map((item) => item.thread_id), ["exact-parent"]);
  assert.deepEqual(splitObservationGap(buckets.unavailable), { stopped: 1, unknown: 1 });
});

test("exact organization pages cap dense trees without dropping an exact item", () => {
  const rows = Array.from({ length: 13 }, (_, index) => `thread-${index + 1}`);
  const first = paginateExactItems(rows, 0, 6);
  const final = paginateExactItems(rows, 2, 6);

  assert.equal(first.total, 13);
  assert.equal(first.page_count, 3);
  assert.deepEqual(first.items, rows.slice(0, 6));
  assert.deepEqual(final.items, rows.slice(12));
});

test("real-time UI labels preserve exact IDs and separate partial coverage from adapter health", () => {
  const actualExactId = "019fcf07-e25e-7868-8ffe-f0f10247bf6f";
  const threads = [
    thread(actualExactId, "owner_attention", "owner"),
    thread("019fcf70-1d2c-70d6-8068-f7dfac8614e8", "stopped"),
    thread("019fcf6e-7d36-7246-98b4-cca11b680e01", "not_loaded_unknown")
  ];
  const buckets = buildRealtimeStatusBuckets(threads, [threads[0]]);

  assert.deepEqual(buckets.owner_result.map((item) => item.thread_id), [actualExactId]);
  assert.deepEqual(observationGapBreakdown(buckets.unavailable), {
    stopped: 1,
    not_loaded_unknown: 1,
    error: 0
  });
  assert.equal(realtimeStatusCopy("owner_result").label, "결과 확인");
  assert.equal(realtimeStatusCopy("stopped").label, "응답 종료");
  assert.equal(realtimeStatusCopy("unknown").label, "상태 신호 없음");
  assert.equal(realtimeStatusCopy("unavailable").label, "비활성·미확인");
  assert.equal(
    formatRealtimeCoverage(
      { health: "ready", coverage: "partial" },
      { lifecycle_matched_enrolled_count: 31, lifecycle_exact_identity_count: 207 }
    ),
    "시스템 정상 · 구조 신호 31/207 (부분 관측)"
  );
  assert.equal(
    formatRealtimeCoverage(
      { health: "unavailable", coverage: "unknown" },
      { lifecycle_matched_enrolled_count: 0, lifecycle_exact_identity_count: 0 }
    ),
    "어댑터 연결 불가 · 구조 신호 0/0 (관측 범위 미확정)"
  );
});

test("initial live projection loading is distinct from a settled adapter failure", () => {
  const pending = liveProjectionLoadPresentation({
    initialPending: true,
    adapter: { health: "unavailable" }
  });
  const ready = liveProjectionLoadPresentation({
    initialPending: false,
    adapter: { health: "ready" }
  });
  const failed = liveProjectionLoadPresentation({
    initialPending: false,
    adapter: { health: "unavailable" }
  });

  assert.deepEqual(
    [pending.state, ready.state, failed.state],
    ["initial_loading", "ready", "failure"]
  );
  assert.equal(pending.label, "실시간 현황 불러오는 중");
  assert.equal(pending.should_render_projection, false);
  assert.equal(ready.should_render_projection, true);
  assert.equal(failed.should_render_projection, true);
});

test("organization usage attribution opens only for a successful exact organization projection", () => {
  assert.equal(isOrganizationUsageAttributionReady({
    adapter: { health: "ready" },
    scope: { lifecycle_source_health: "available" }
  }), true);
  assert.equal(isOrganizationUsageAttributionReady({
    adapter: { health: "partial" },
    scope: { lifecycle_source_health: "available" }
  }), true);
  assert.equal(isOrganizationUsageAttributionReady({
    adapter: { health: "partial" },
    scope: { lifecycle_source_health: "hold" }
  }), false);
  assert.equal(isOrganizationUsageAttributionReady({ adapter: { health: "unavailable" }, scope: {} }), false);
  assert.equal(isOrganizationUsageAttributionReady({ adapter: { health: "error" }, scope: {} }), false);
});

test("first live projection failure stays fail-closed while refresh failure retains the last good observation", () => {
  const initialFailure = { adapter: { health: "unavailable" }, generated_at: null, threads: [] };
  const firstFailure = resolveLiveProjectionRefresh({
    lastSuccessfulProjection: null,
    nextProjection: initialFailure
  });
  assert.equal(firstFailure.projection, initialFailure);
  assert.equal(firstFailure.retained_last_good, false);
  assert.equal(firstFailure.refresh_failure, null);

  const successful = {
    adapter: { health: "partial" },
    generated_at: "2026-08-05T05:00:00.000Z",
    threads: [{ thread_id: "exact-live-thread" }]
  };
  const accepted = resolveLiveProjectionRefresh({
    lastSuccessfulProjection: null,
    nextProjection: successful
  });
  assert.equal(accepted.projection, successful);
  assert.equal(accepted.accepted_success, true);

  const refreshFailure = resolveLiveProjectionRefresh({
    lastSuccessfulProjection: successful,
    nextProjection: { adapter: { health: "error" }, generated_at: null, threads: [] }
  });
  assert.equal(refreshFailure.projection, successful);
  assert.equal(refreshFailure.retained_last_good, true);
  assert.equal(refreshFailure.refresh_failure, "error");
  assert.equal(refreshFailure.projection.generated_at, "2026-08-05T05:00:00.000Z");
});

test("a transient lifecycle 0/0 candidate never replaces the last validated projection", () => {
  const lastGood = {
    adapter: { health: "ready", coverage: "partial" },
    scope: {
      lifecycle_source_health: "available",
      lifecycle_matched_enrolled_count: 50,
      lifecycle_exact_identity_count: 399
    },
    generated_at: "2026-08-06T01:00:00.000Z",
    threads: [thread("exact-active", "active")]
  };
  const zeroCandidate = {
    adapter: { health: "partial", coverage: "unknown" },
    scope: {
      lifecycle_source_health: "hold",
      lifecycle_matched_enrolled_count: 0,
      lifecycle_exact_identity_count: 0
    },
    generated_at: "2026-08-06T01:00:10.000Z",
    threads: []
  };

  const resolved = resolveLiveProjectionRefresh({
    lastSuccessfulProjection: lastGood,
    nextProjection: zeroCandidate
  });

  assert.equal(resolved.projection, lastGood);
  assert.equal(resolved.retained_last_good, true);
  assert.equal(resolved.accepted_success, false);
  assert.equal(resolved.refresh_failure, "lifecycle_hold");
  assert.equal(resolved.projection.scope.lifecycle_exact_identity_count, 399);
  assert.equal(resolved.projection.threads[0].thread_id, "exact-active");
});

test("project usage chart keeps Meter project IDs and reconciles the hidden tail", () => {
  const rows = buildProjectUsageChartRows({
    top: [
      { project_id: "soulforge", turns: 8, total_tokens: 800, credits: 8, credit_unknown_turns: 0 },
      { project_id: "unassigned", turns: 3, total_tokens: 300, credits: 3, credit_unknown_turns: 0 },
      { project_id: "project-c", turns: 2, total_tokens: 200, credits: 2, credit_unknown_turns: 0 }
    ],
    other: { turns: 1, total_tokens: 100, credits: 1, credit_unknown_turns: 0 }
  }, 2);

  assert.deepEqual(rows.map((row) => row.label), ["soulforge", "기타 프로젝트", "미분류 프로젝트"]);
  assert.equal(rows.reduce((total, row) => total + row.total_tokens, 0), 1400);
  assert.equal(rows.find((row) => row.usage_id === "other_projects")?.total_tokens, 300);
});

test("organization usage chart joins exact task IDs only and leaves every unmatched metric visible", () => {
  const attribution = new Map([
    ["task-a", { organization_group_id: "system", organization_label: "SYSTEM" }],
    ["task-b", { organization_group_id: "system", organization_label: "SYSTEM" }],
    ["task-c", { organization_group_id: "kvds", organization_label: "KVDS" }]
  ]);
  const rows = buildOrganizationUsageChartRows({
    top: [
      { task_id: "task-a", turns: 2, total_tokens: 200, credits: 2, credit_unknown_turns: 0 },
      { task_id: "task-b", turns: 1, total_tokens: 100, credits: 1, credit_unknown_turns: 0 },
      { task_id: "task-c", turns: 1, total_tokens: 80, credits: 0.8, credit_unknown_turns: 0 },
      { task_id: "task-unmatched", turns: 1, total_tokens: 40, credits: 0.4, credit_unknown_turns: 0 }
    ],
    other: { turns: 3, total_tokens: 60, credits: 0.6, credit_unknown_turns: 1 }
  }, attribution);

  assert.deepEqual(rows.map((row) => row.label), ["SYSTEM", "미연결·기타", "KVDS"]);
  assert.equal(rows.reduce((total, row) => total + row.total_tokens, 0), 480);
  assert.deepEqual(
    rows.find((row) => row.usage_id === "unlinked_other"),
    {
      usage_id: "unlinked_other",
      label: "미연결·기타",
      secondary: "unlinked_other",
      turns: 4,
      total_tokens: 100,
      credits: 1,
      credit_unknown_turns: 1
    }
  );
});

test("usage charts omit zero-only synthetic remainder rows", () => {
  const emptyOther = { turns: 0, total_tokens: 0, credits: 0, credit_unknown_turns: 0 };
  assert.deepEqual(buildProjectUsageChartRows({
    top: [{ project_id: "soulforge", turns: 1, total_tokens: 10, credits: 0.1, credit_unknown_turns: 0 }],
    other: emptyOther
  }), [{
    usage_id: "soulforge",
    label: "soulforge",
    secondary: "soulforge",
    turns: 1,
    total_tokens: 10,
    credits: 0.1,
    credit_unknown_turns: 0
  }]);
  assert.deepEqual(buildOrganizationUsageChartRows({
    top: [],
    other: { ...emptyOther, credits: 1e-12 }
  }, new Map()), []);
});

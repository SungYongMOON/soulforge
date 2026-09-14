// PLAUD 녹음 신선도 판정 회귀.
//
// 이 probe 가 막으려는 실패는 조용한 것이다: 5-lane 감독자는 매 회차 PLAUD 카탈로그를
// 정상으로 읽으므로, 기기가 며칠째 아무것도 올리지 않아도 모든 하트비트가 초록이다.
// 그래서 여기 시험은 전부 "달력이 기대하는 날의 녹음이 있는가"를 묻고, 시각은 고정한다.

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  DEFAULT_PLAUD_FRESHNESS_POLICY,
  PLAUD_FRESHNESS_POLICY_SCHEMA_VERSION,
  judgePlaudRecordingFreshness,
  normalisePlaudFreshnessPolicy,
  previousExpectedRecordingDate,
  runProbe,
  validateWatchtowerBinding,
  WATCHTOWER_BINDING_SCHEMA_VERSION,
} from "./watchtower.mjs";
import { EXAMPLE_BINDING } from "./cli.mjs";

// KST 벽시계를 epoch 로. 판정은 KST 로만 이야기하므로 시험도 그 말로 쓴다.
const kst = (text) => Date.parse(`${text}+09:00`);

// 2026-09-11 금 · 09-12 토 · 09-13 일 · 09-14 월 · 09-15 화 · 09-16 수
const LIVE_SHAPED_HEALTH = Object.freeze({
  schema_version: "soulforge.ingress.continuous_health.v3",
  plaud_enabled: true,
  plaud_status: "ok",
  plaud_catalog_complete: true,
  observed_at: null,
  plaud_last_success_at: null,
});

function healthAt(nowMs, overrides = {}) {
  const recent = new Date(nowMs - 60_000).toISOString();
  return { ...LIVE_SHAPED_HEALTH, observed_at: recent, plaud_last_success_at: recent, ...overrides };
}

function judge(nowKst, latest, extra = {}) {
  const now = kst(nowKst);
  return judgePlaudRecordingFreshness({
    now,
    latest_recording_date: latest,
    policy: DEFAULT_PLAUD_FRESHNESS_POLICY,
    ingress_health: healthAt(now),
    ...extra,
  });
}

test("required weekday is the most recent expected day before today, skipping weekends and holidays", () => {
  const policy = DEFAULT_PLAUD_FRESHNESS_POLICY;
  // 화요일: 어제(월)
  assert.equal(previousExpectedRecordingDate("2026-09-15", policy), "2026-09-14");
  // 월요일: 주말을 건너뛰어 지난 금요일
  assert.equal(previousExpectedRecordingDate("2026-09-14", policy), "2026-09-11");
  // 토요일: 어제인 금요일 (주말에는 안 쓰지만 금요일 녹음은 기대한다)
  assert.equal(previousExpectedRecordingDate("2026-09-12", policy), "2026-09-11");
  // 일요일도 같은 금요일을 가리킨다 — 주말 이틀 내내 판정이 흔들리지 않는다.
  assert.equal(previousExpectedRecordingDate("2026-09-13", policy), "2026-09-11");
  // 공휴일 다음날: 그 공휴일을 건너뛰고 그 앞 평일
  const withHoliday = { ...policy, holiday_dates: ["2026-09-14"] };
  assert.equal(previousExpectedRecordingDate("2026-09-15", withHoliday), "2026-09-11");
  // 기대 평일이 하나도 없는 정책은 답을 만들 수 없다.
  assert.equal(previousExpectedRecordingDate("2026-09-15", { ...policy, expected_weekdays: [] }), null);
});

test("a recording on (or after) the required weekday is ok; the weekend never turns amber on its own", () => {
  // 화요일 아침, 어제(월) 녹음이 들어와 있다.
  assert.deepEqual(judge("2026-09-15T08:00:00", "2026-09-14"), {
    state: "ok", reasons: [], age_seconds: 115_200,
    latest_recording_date: "2026-09-14", required_recording_date: "2026-09-14",
  });
  // 토요일·일요일: 금요일 녹음이면 충분하다. 주말에는 녹음하지 않는다.
  for (const nowKst of ["2026-09-12T20:00:00", "2026-09-13T23:59:00"]) {
    assert.equal(judge(nowKst, "2026-09-11").state, "ok");
  }
  // 월요일 아침도 마찬가지. 주말 이틀이 지나도 금요일 녹음이 최신이면 정상이다.
  assert.equal(judge("2026-09-14T09:30:00", "2026-09-11").state, "ok");
  // 공휴일 다음날: 공휴일에 녹음이 없다고 오류가 되지 않는다.
  assert.equal(judgePlaudRecordingFreshness({
    now: kst("2026-09-15T15:00:00"),
    latest_recording_date: "2026-09-11",
    policy: { ...DEFAULT_PLAUD_FRESHNESS_POLICY, holiday_dates: ["2026-09-14"] },
    ingress_health: healthAt(kst("2026-09-15T15:00:00")),
  }).state, "ok");
});

test("a missing weekday recording is amber until the next day's cutoff and red after it", () => {
  // 자정 직후: 월요일 녹음이 아직 없지만 동기화 중일 수 있다.
  const earlyMorning = judge("2026-09-15T00:03:00", "2026-09-09");
  assert.equal(earlyMorning.state, "degraded");
  assert.ok(earlyMorning.reasons.includes("plaud_recording_not_yet_synced"));
  assert.equal(earlyMorning.required_recording_date, "2026-09-14");

  // 경계 그 자체(정오)는 이미 지난 것으로 센다.
  assert.equal(judge("2026-09-15T11:59:59", "2026-09-09").state, "degraded");
  assert.equal(judge("2026-09-15T12:00:00", "2026-09-09").state, "stale");

  // 정오 이후: 사람이 봐야 한다. 마지막 녹음일을 사유에 그대로 싣는다.
  const afternoon = judge("2026-09-15T14:00:00", "2026-09-09");
  assert.equal(afternoon.state, "stale");
  assert.ok(afternoon.reasons.includes("plaud_no_weekday_recording_since:2026-09-09"));
  assert.equal(afternoon.age_seconds, 6 * 86_400 + 14 * 3_600);

  // cutoff 는 정책이 옮길 수 있다.
  const lateCutoff = judgePlaudRecordingFreshness({
    now: kst("2026-09-15T14:00:00"),
    latest_recording_date: "2026-09-09",
    policy: { ...DEFAULT_PLAUD_FRESHNESS_POLICY, cutoff_hour_kst: 18 },
    ingress_health: healthAt(kst("2026-09-15T14:00:00")),
  });
  assert.equal(lateCutoff.state, "degraded");
});

test("the gap reason separates a dead connection from a device that has not uploaded", () => {
  const now = kst("2026-09-15T14:00:00");
  const judgeWith = (health, error = null) => judgePlaudRecordingFreshness({
    now, latest_recording_date: "2026-09-09", policy: DEFAULT_PLAUD_FRESHNESS_POLICY,
    ingress_health: health, ingress_health_error: error,
  }).reasons;

  // 감독자가 방금 회차를 성공시켰다 → 연결은 살아 있고 남는 설명은 기기 업로드 공백.
  assert.ok(judgeWith(healthAt(now)).includes("device_upload_gap_suspected"));

  // 실측 모양(2026-09-15): custody 미완성 등으로 degraded 지만 최근 성공 회차가 있다.
  // 이것을 로그인 실패로 부르면 사람을 엉뚱한 곳으로 보낸다 — 상태 단어는 따로 싣되
  // 원인은 업로드 공백이다.
  const degraded = judgeWith(healthAt(now, { plaud_status: "degraded" }));
  assert.ok(degraded.includes("device_upload_gap_suspected"));
  assert.ok(degraded.includes("plaud_supervisor_status_degraded"));
  assert.ok(!degraded.includes("plaud_api_or_login_failure"));

  // 같은 lane 이 더 오래 degraded 로 머물면 `plaud_last_success_at` 은 전진을 멈춘다.
  // 그래도 이번 회차에 카탈로그를 끝까지 읽었다면 PLAUD 는 응답하고 있는 것이다 —
  // 그 시각으로만 판정하면 멀쩡한 연결이 로그인 실패로 보고된다.
  assert.ok(judgeWith({
    ...LIVE_SHAPED_HEALTH,
    plaud_status: "degraded",
    observed_at: new Date(now - 4 * 60_000).toISOString(),
    plaud_last_success_at: new Date(now - 6 * 3_600_000).toISOString(),
  }).includes("device_upload_gap_suspected"));

  // 성공 회차도 오래됐고 이번 회차에 카탈로그도 못 읽었다 → 연결·로그인 쪽을 먼저 본다.
  assert.ok(judgeWith({
    ...LIVE_SHAPED_HEALTH,
    observed_at: new Date(now - 4 * 60_000).toISOString(),
    plaud_catalog_complete: false,
    plaud_last_success_at: new Date(now - 31 * 60_000).toISOString(),
  }).includes("plaud_api_or_login_failure"));

  // 감독자 자체가 30분 넘게 회차를 돌지 않았다 → 연결을 확인해 주는 근거가 없다.
  assert.ok(judgeWith({
    ...LIVE_SHAPED_HEALTH,
    plaud_status: "degraded",
    observed_at: new Date(now - 31 * 60_000).toISOString(),
    plaud_last_success_at: new Date(now - 31 * 60_000).toISOString(),
  }).includes("plaud_api_or_login_failure"));

  // 감독자가 failed 라고 말하면 회차가 최근이어도 연결 실패다.
  assert.ok(judgeWith(healthAt(now, { plaud_status: "failed" })).includes("plaud_api_or_login_failure"));

  // 감독자가 실어 온 안전 코드는 그대로 사유가 된다.
  assert.ok(judgeWith({
    ...LIVE_SHAPED_HEALTH,
    plaud_last_success_at: null,
    error_codes: ["auth_refresh_failed", "plaud_collection_failed", "unrelated_code", "NOT SAFE"],
  }).join(" ").includes("auth_refresh_failed"));

  // 수집이 꺼져 있으면 그것은 로그인 실패가 아니다.
  assert.deepEqual(judgeWith({ ...LIVE_SHAPED_HEALTH, plaud_enabled: false }).slice(1),
    ["plaud_collection_disabled"]);

  // 감독자 health 를 못 읽으면 원인 구분 자체가 불가능하다는 사실을 남긴다.
  assert.deepEqual(judgeWith(null, "source_missing").slice(1),
    ["plaud_ingress_health_unavailable", "source_missing"]);
});

test("a policy document is optional, but a malformed one is visible instead of silently ignored", () => {
  assert.deepEqual(normalisePlaudFreshnessPolicy({
    schema_version: PLAUD_FRESHNESS_POLICY_SCHEMA_VERSION,
    expected_weekdays: [1, 2, 3, 4, 5, 5],
    cutoff_hour_kst: 9,
    holiday_dates: ["2026-09-14"],
  }), {
    policy: { expected_weekdays: [1, 2, 3, 4, 5], cutoff_hour_kst: 9, holiday_dates: ["2026-09-14"] },
    policy_invalid: false,
  });
  for (const bad of [
    null, [], "policy",
    { expected_weekdays: [1], cutoff_hour_kst: 12, holiday_dates: [] },                       // schema_version 없음
    { schema_version: PLAUD_FRESHNESS_POLICY_SCHEMA_VERSION, expected_weekdays: [], cutoff_hour_kst: 12, holiday_dates: [] },
    { schema_version: PLAUD_FRESHNESS_POLICY_SCHEMA_VERSION, expected_weekdays: [7], cutoff_hour_kst: 12, holiday_dates: [] },
    { schema_version: PLAUD_FRESHNESS_POLICY_SCHEMA_VERSION, expected_weekdays: [1], cutoff_hour_kst: 24, holiday_dates: [] },
    { schema_version: PLAUD_FRESHNESS_POLICY_SCHEMA_VERSION, expected_weekdays: [1], cutoff_hour_kst: 12, holiday_dates: ["9/14"] },
  ]) {
    assert.deepEqual(normalisePlaudFreshnessPolicy(bad),
      { policy: DEFAULT_PLAUD_FRESHNESS_POLICY, policy_invalid: true }, JSON.stringify(bad));
  }
  // 정책이 깨졌으면 녹음이 신선해도 초록으로 두지 않는다.
  const withBrokenPolicy = judgePlaudRecordingFreshness({
    now: kst("2026-09-15T08:00:00"), latest_recording_date: "2026-09-14",
    policy: DEFAULT_PLAUD_FRESHNESS_POLICY, policy_invalid: true,
    ingress_health: healthAt(kst("2026-09-15T08:00:00")),
  });
  assert.deepEqual([withBrokenPolicy.state, withBrokenPolicy.reasons],
    ["degraded", ["plaud_freshness_policy_invalid"]]);
  // 기대 평일이 없는 정책으로는 판정 자체를 만들지 않는다.
  assert.equal(judgePlaudRecordingFreshness({
    now: kst("2026-09-15T08:00:00"), latest_recording_date: "2026-09-14",
    policy: { ...DEFAULT_PLAUD_FRESHNESS_POLICY, expected_weekdays: [] },
  }).state, "down");
});

test("the probe reads the library index end to end and fails closed when it cannot", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "plaud-freshness-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const indexPath = join(root, "recordings.current.json");
  const healthPath = join(root, "continuous_ingress.json");
  const policyPath = join(root, "plaud_freshness.policy.v0.json");
  const now = kst("2026-09-15T14:00:00");
  const probe = {
    kind: "plaud_recording_freshness",
    path: indexPath,
    expected_schema_version: "soulforge.voice_recording_library_index.v0",
    health_path: healthPath,
    policy_path: policyPath,
  };
  const writeIndex = (recordings, overrides = {}) => writeFile(indexPath, JSON.stringify({
    schema_version: "soulforge.voice_recording_library_index.v0",
    recording_count: recordings.length,
    recordings,
    ...overrides,
  }));
  const row = (date) => ({ session_id: `s_${date}`, recording_date: date, registered_at_kst: `${date}T09:00:00+09:00` });

  // 색인 없음 → down. 없는 것을 정상으로도, 오래된 판정으로도 덮지 않는다.
  assert.deepEqual(await runProbe(probe, { now }), {
    state: "down", reasons: ["source_missing"], age_seconds: null,
  });

  await writeFile(healthPath, JSON.stringify(healthAt(now)));

  // 정책 파일은 아직 없다 → 기본값(월~금, 정오)으로 판정한다.
  await writeIndex([row("2026-08-31"), row("2026-09-09"), row("2026-09-04")]);
  const stale = await runProbe(probe, { now });
  assert.equal(stale.state, "stale");
  assert.deepEqual(stale.reasons,
    ["plaud_no_weekday_recording_since:2026-09-09", "device_upload_gap_suspected"]);
  assert.deepEqual(
    [stale.latest_recording_date, stale.required_recording_date],
    ["2026-09-09", "2026-09-14"],
  );

  // 오늘 아침에 들어온 회차가 색인에 등록되면 같은 시각에 초록으로 바뀐다.
  await writeIndex([row("2026-09-09"), row("2026-09-14")]);
  assert.equal((await runProbe(probe, { now })).state, "ok");

  // 손으로 고친 정책이 깨져 있으면 기본값으로 판정하되 그 사실을 남긴다.
  await writeFile(policyPath, JSON.stringify({ expected_weekdays: [1, 2, 3, 4, 5] }));
  assert.deepEqual((await runProbe(probe, { now })).reasons, ["plaud_freshness_policy_invalid"]);
  await writeFile(policyPath, JSON.stringify({
    schema_version: PLAUD_FRESHNESS_POLICY_SCHEMA_VERSION,
    expected_weekdays: [1, 2, 3, 4, 5], cutoff_hour_kst: 12, holiday_dates: [],
  }));
  assert.equal((await runProbe(probe, { now })).state, "ok");

  // 깨진 색인·다른 schema·날짜 없는 색인은 전부 down 이며 사유가 다르다.
  await writeFile(indexPath, "{not json");
  assert.deepEqual((await runProbe(probe, { now })).reasons, ["source_invalid_json"]);
  await writeIndex([row("2026-09-14")], { schema_version: "soulforge.voice_recording_library_index.v1" });
  assert.deepEqual((await runProbe(probe, { now })).reasons, ["source_schema_invalid"]);
  await writeIndex([{ session_id: "s_undated" }, null]);
  assert.deepEqual((await runProbe(probe, { now })).reasons, ["plaud_index_no_recording_date"]);
  await writeFile(indexPath, JSON.stringify({
    schema_version: "soulforge.voice_recording_library_index.v0", recordings: {},
  }));
  assert.deepEqual((await runProbe(probe, { now })).reasons, ["plaud_index_recordings_invalid"]);
});

test("the binding contract requires the supervisor health path and rejects a heartbeat window", () => {
  const withProbe = (probe) => validateWatchtowerBinding({
    schema_version: WATCHTOWER_BINDING_SCHEMA_VERSION,
    state_root: "/synthetic/state",
    probes: { plaud_recording_freshness: probe },
  });
  const base = {
    kind: "plaud_recording_freshness",
    path: "/synthetic/recordings.current.json",
    health_path: "/synthetic/continuous_ingress.json",
  };
  assert.doesNotThrow(() => withProbe(base));
  assert.doesNotThrow(() => withProbe({ ...base, policy_path: "/synthetic/policy.json" }));
  const { health_path: _omitted, ...withoutHealth } = base;
  assert.throws(() => withProbe(withoutHealth), { code: "probe_plaud_health_path_invalid" });
  assert.throws(() => withProbe({ ...base, policy_path: "" }), { code: "probe_plaud_policy_path_invalid" });
  // 이 probe 는 달력으로 판정한다. 하트비트 창을 적어 두면 뜻 없는 값이므로 거부한다.
  assert.throws(() => withProbe({ ...base, period_seconds: 86_400 }), { code: "probe_window_invalid" });
  assert.throws(() => withProbe({ ...base, grace_seconds: 0 }), { code: "probe_window_invalid" });
  // 예시 binding 이 같은 계약을 지킨다.
  assert.doesNotThrow(() => validateWatchtowerBinding(structuredClone(EXAMPLE_BINDING)));
  const example = EXAMPLE_BINDING.probes.plaud_recording_freshness;
  assert.equal(example.kind, "plaud_recording_freshness");
  assert.ok(example.path.endsWith("/library/index/recordings.current.json"));
  assert.ok(example.health_path.endsWith("/state/health/continuous_ingress.json"));
});

// watchtower.mjs — Soulforge 관제 판정 엔진 (W1: 검사·표시 전용, 복구는 W2).
// 이미 생산 중인 하트비트/상태 파일을 period+grace 2단 윈도로 판정해
// 경로가 노출되지 않는 topology health 스냅샷을 만든다. 원문·secret은 읽지 않는다.

import { readFile, readdir, stat, open, mkdir, writeFile, rename } from "node:fs/promises";
import { join, dirname } from "node:path";
import { spawn } from "node:child_process";

import { edgeDeliveryVerdict, summariseEdgeDelivery, topologySkeleton } from "./topology.mjs";

export const WATCHTOWER_BINDING_SCHEMA_VERSION = "soulforge.watchtower.binding.v1";
export const WATCHTOWER_SNAPSHOT_SCHEMA_VERSION = "soulforge.watchtower.topology_health.v2";

const PROBE_KINDS = new Set([
  "jsonl_tail", "json_file", "dir_latest_mtime", "schtask", "plaud_recording_freshness",
]);
// 달력 판정 probe. 하트비트가 아니라 "기대 평일에 자료가 들어왔는가"를 보므로
// period+grace 2단 윈도가 성립하지 않는다. 뜻 없는 창을 기입하게 두지 않고 거부한다.
const CALENDAR_PROBE_KINDS = new Set(["plaud_recording_freshness"]);
const HEALTH_STATES = ["ok", "degraded", "stale", "down", "unmonitored"];
const MAX_SOURCE_BYTES = 4 * 1024 * 1024;
const MAX_DIR_ENTRIES = 4000;
const TASK_RUNNING_MARKERS = ["실행", "Running"];
const TASK_READY_MARKERS = ["준비", "Ready"];
const TASK_DISABLED_MARKERS = ["사용 안 함", "Disabled"];

export class WatchtowerError extends Error {
  constructor(code, message) {
    super(`${code}: ${message}`);
    this.name = "WatchtowerError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new WatchtowerError(code, message);
}

function plainObject(value, code) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail(code, "Expected a plain object");
  }
  return value;
}

function fieldPath(value, path) {
  let cursor = value;
  for (const part of String(path).split(".")) {
    if (cursor === null || typeof cursor !== "object") return undefined;
    cursor = cursor[part];
  }
  return cursor;
}

export function validateWatchtowerBinding(binding) {
  plainObject(binding, "binding_invalid");
  if (binding.schema_version !== WATCHTOWER_BINDING_SCHEMA_VERSION) {
    fail("binding_schema_invalid", "Unexpected binding schema_version");
  }
  if (typeof binding.state_root !== "string" || binding.state_root.length === 0) {
    fail("binding_state_root_invalid", "state_root is required");
  }
  plainObject(binding.probes, "binding_probes_invalid");
  for (const [key, probe] of Object.entries(binding.probes)) {
    if (!/^[a-z][a-z0-9_]{0,63}$/u.test(key)) fail("probe_key_invalid", `probe key ${key}`);
    plainObject(probe, "probe_invalid");
    if (!PROBE_KINDS.has(probe.kind)) fail("probe_kind_invalid", `probe ${key}`);
    if (probe.kind === "schtask") {
      if (typeof probe.task_name !== "string" || probe.task_name.length === 0) {
        fail("probe_task_name_invalid", `probe ${key}`);
      }
    } else if (typeof probe.path !== "string" || probe.path.length === 0) {
      fail("probe_path_invalid", `probe ${key}`);
    }
    if (probe.resident_task !== undefined && probe.scheduled_task !== undefined) {
      fail("probe_task_owner_invalid", `probe ${key}`);
    }
    for (const field of ["resident_task", "scheduled_task"]) {
      if (probe[field] !== undefined && (typeof probe[field] !== "string" || probe[field].length === 0)) {
        fail("probe_task_name_invalid", `probe ${key}.${field}`);
      }
    }
    if (probe.expected_schema_version !== undefined && (typeof probe.expected_schema_version !== "string" || probe.expected_schema_version.length === 0)) {
      fail("probe_schema_contract_invalid", `probe ${key}`);
    }
    for (const field of ["required_fields", "required_string_fields", "required_timestamp_fields", "nullable_timestamp_fields"]) {
      if (probe[field] !== undefined && (!Array.isArray(probe[field]) || probe[field].some((item) => typeof item !== "string" || item.length === 0))) {
        fail("probe_schema_contract_invalid", `probe ${key}.${field}`);
      }
    }
    if (probe.expected_field_values !== undefined) {
      plainObject(probe.expected_field_values, "probe_schema_contract_invalid");
      for (const [field, value] of Object.entries(probe.expected_field_values)) {
        if (typeof field !== "string" || field.length === 0 || typeof value !== "string" || value.length === 0) {
          fail("probe_schema_contract_invalid", `probe ${key}.expected_field_values`);
        }
      }
    }
    if ((probe.activity_field === undefined) !== (probe.activity_values === undefined)
      || (probe.activity_field !== undefined
        && (typeof probe.activity_field !== "string" || probe.activity_field.length === 0
          || !Array.isArray(probe.activity_values) || probe.activity_values.length === 0
          || probe.activity_values.some((value) => typeof value !== "string"
            || !/^[a-z][a-z0-9_]{0,31}$/u.test(value))))) {
      fail("probe_activity_contract_invalid", `probe ${key}`);
    }
    for (const field of ["activity_count_field", "activity_next_at_field"]) {
      if (probe[field] !== undefined
        && (probe.activity_field === undefined || typeof probe[field] !== "string" || probe[field].length === 0)) {
        fail("probe_activity_contract_invalid", `probe ${key}.${field}`);
      }
    }
    if (CALENDAR_PROBE_KINDS.has(probe.kind)) {
      for (const field of ["period_seconds", "grace_seconds"]) {
        if (probe[field] !== undefined) fail("probe_window_invalid", `probe ${key}.${field}`);
      }
    } else {
      for (const field of ["period_seconds", "grace_seconds"]) {
        if (!Number.isSafeInteger(probe[field]) || probe[field] < 0 || probe[field] > 604800) {
          fail("probe_window_invalid", `probe ${key}.${field}`);
        }
      }
      if (probe.period_seconds === 0) fail("probe_window_invalid", `probe ${key}.period_seconds`);
    }
    if (probe.kind === "plaud_recording_freshness") {
      // health_path 는 선택이 아니다. 이 probe 의 목적 절반이 "연결이 끊긴 것인지
      // 기기가 안 올린 것인지"를 가르는 것이고, 감독자 health 없이는 그 구분을 못 한다.
      if (typeof probe.health_path !== "string" || probe.health_path.length === 0) {
        fail("probe_plaud_health_path_invalid", `probe ${key}.health_path`);
      }
      if (probe.policy_path !== undefined
        && (typeof probe.policy_path !== "string" || probe.policy_path.length === 0)) {
        fail("probe_plaud_policy_path_invalid", `probe ${key}.policy_path`);
      }
    }
    if (probe.degrade_when !== undefined) {
      if (!Array.isArray(probe.degrade_when)) fail("probe_degrade_invalid", `probe ${key}`);
      for (const rule of probe.degrade_when) {
        plainObject(rule, "probe_degrade_invalid");
        if (typeof rule.field !== "string" || !Number.isFinite(rule.above)) {
          fail("probe_degrade_invalid", `probe ${key}`);
        }
      }
    }
    if (probe.detail !== undefined) {
      plainObject(probe.detail, "probe_detail_invalid");
      if (probe.detail.kind !== "mail_account_summaries") fail("probe_detail_invalid", `probe ${key}`);
      if (typeof probe.detail.path !== "string" || probe.detail.path.length === 0) {
        fail("probe_detail_invalid", `probe ${key}`);
      }
      if (probe.detail.account_labels !== undefined) {
        plainObject(probe.detail.account_labels, "probe_detail_invalid");
        for (const label of Object.values(probe.detail.account_labels)) {
          if (typeof label !== "string" || label.length === 0 || label.length > 40 || label.includes("@")) {
            fail("probe_detail_invalid", `probe ${key}`);
          }
        }
      }
    }
  }
  return binding;
}

async function readBoundedFile(path) {
  const info = await stat(path);
  if (info.size > MAX_SOURCE_BYTES) fail("source_too_large", "source file exceeds bound");
  const text = await readFile(path, "utf8");
  return { text, mtimeMs: info.mtimeMs };
}

async function probeJsonFile(probe) {
  const { text, mtimeMs } = await readBoundedFile(probe.path);
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    fail("source_invalid_json", "invalid JSON receipt");
  }
  plainObject(parsed, "source_invalid_record");
  if (typeof probe.expected_schema_version === "string" && parsed.schema_version !== probe.expected_schema_version) {
    fail("source_schema_invalid", "unexpected receipt schema_version");
  }
  for (const field of probe.required_fields ?? []) {
    if (fieldPath(parsed, field) === undefined) fail("source_required_field_missing", "required receipt field absent");
  }
  for (const field of probe.required_string_fields ?? []) {
    const value = fieldPath(parsed, field);
    if (typeof value !== "string" || value.length === 0) fail("source_string_invalid", "receipt string field invalid");
  }
  for (const field of probe.required_timestamp_fields ?? []) {
    const value = fieldPath(parsed, field);
    if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) fail("source_timestamp_invalid", "receipt timestamp invalid");
  }
  for (const field of probe.nullable_timestamp_fields ?? []) {
    const value = fieldPath(parsed, field);
    if (value !== null && (typeof value !== "string" || !Number.isFinite(Date.parse(value)))) fail("source_timestamp_invalid", "receipt timestamp invalid");
  }
  for (const [field, expected] of Object.entries(probe.expected_field_values ?? {})) {
    if (fieldPath(parsed, field) !== expected) fail("source_expected_value_invalid", "receipt fixed field mismatch");
  }
  return { record: parsed, mtimeMs };
}

async function probeJsonlTail(probe) {
  const handle = await open(probe.path, 'r');
  try {
    const before = await handle.stat();
    if (!before.isFile()) fail('source_missing', 'not a regular observation file');
    const offset = Math.max(0, before.size - MAX_SOURCE_BYTES);
    const bytes = Buffer.alloc(Math.min(before.size, MAX_SOURCE_BYTES));
    const { bytesRead } = await handle.read(bytes, 0, bytes.length, offset);
    const after = await handle.stat();
    const current = await stat(probe.path);
    if (bytesRead !== bytes.length || after.size !== before.size || after.mtimeMs !== before.mtimeMs
      || current.dev !== before.dev || current.ino !== before.ino || current.size !== before.size || current.mtimeMs !== before.mtimeMs) {
      fail('source_changed_during_read', 'observation changed during bounded read');
    }
    let tail = bytes;
    if (offset > 0) {
      const newline = tail.indexOf(10);
      if (newline < 0) fail('source_too_large', 'latest record exceeds read bound');
      tail = tail.subarray(newline + 1);
    }
    const lines = tail.toString('utf8').split('\n').map(line => line.trim()).filter(Boolean);
    if (!lines.length) fail('source_empty', 'jsonl has no complete records in tail');
    let record;
    try { record = JSON.parse(lines.at(-1)); }
    catch { fail('source_invalid_json', 'latest observation is not valid JSON'); }
    return { record, mtimeMs: before.mtimeMs };
  } finally { await handle.close(); }
}

async function newestMtimeUnder(root, depthLeft, budget) {
  let newest = null;
  const entries = await readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    if (budget.count >= MAX_DIR_ENTRIES) break;
    budget.count += 1;
    const target = join(root, entry.name);
    try {
      if (entry.isDirectory()) {
        if (depthLeft > 0) {
          const child = await newestMtimeUnder(target, depthLeft - 1, budget);
          if (child !== null && (newest === null || child > newest)) newest = child;
        }
      } else if (entry.isFile()) {
        const info = await stat(target);
        if (newest === null || info.mtimeMs > newest) newest = info.mtimeMs;
      }
    } catch {
      continue;
    }
  }
  return newest;
}

function defaultRunSchtasks(taskName) {
  return new Promise((resolve) => {
    const child = spawn("schtasks.exe", ["/query", "/tn", taskName, "/fo", "LIST"], {
      windowsHide: true,
    });
    const chunks = [];
    child.stdout.on("data", (chunk) => chunks.push(chunk));
    child.on("error", () => resolve(null));
    child.on("close", (code) => {
      if (code !== 0) {
        resolve(null);
        return;
      }
      let text;
      try {
        text = new TextDecoder("euc-kr").decode(Buffer.concat(chunks));
      } catch {
        text = Buffer.concat(chunks).toString("utf8");
      }
      resolve(text);
    });
  });
}

async function schtaskState(probe, runSchtasks) {
  const text = await runSchtasks(probe.task_name);
  if (text === null) return "query_failed";
  if (TASK_RUNNING_MARKERS.some((marker) => text.includes(marker))) return "running";
  if (TASK_DISABLED_MARKERS.some((marker) => text.includes(marker))) return "disabled";
  if (TASK_READY_MARKERS.some((marker) => text.includes(marker))) return "ready";
  return "unknown";
}

function judgeTaskOwner(state, mode) {
  if (state === "query_failed" || state === "unknown") {
    return { state: "unmonitored", reason: "task_state_unknown" };
  }
  if (mode === "scheduled") {
    return state === "disabled"
      ? { state: "down", reason: "task_disabled" }
      : { state: "ok", reason: null };
  }
  return state === "running"
    ? { state: "ok", reason: null }
    : { state: "down", reason: state === "disabled" ? "task_disabled" : "task_not_running" };
}

async function judgeProbeTaskOwner(probe, runSchtasks) {
  if (typeof runSchtasks !== "function") return null;
  if (typeof probe.resident_task === "string") {
    const state = await schtaskState({ task_name: probe.resident_task }, runSchtasks);
    return judgeTaskOwner(state, "resident");
  }
  if (typeof probe.scheduled_task === "string") {
    const state = await schtaskState({ task_name: probe.scheduled_task }, runSchtasks);
    return judgeTaskOwner(state, "scheduled");
  }
  return null;
}

function judgeWindow(ageSeconds, probe) {
  if (ageSeconds <= probe.period_seconds) return "fresh";
  if (ageSeconds <= probe.period_seconds + probe.grace_seconds) return "late";
  return "stale";
}

const SAFE_ERROR_CODE = /^[a-z][a-z0-9_]{0,127}$/u;
const WATCHTOWER_CHECK_INTERVAL_SECONDS = 300;
const TRACKING_EVIDENCE_OWNER_BY_NODE = Object.freeze({
  gate_five_field: "five_field_event_validator",
  store_workmeta: "workmeta_owner_bounded_validator",
  watchtower_self: "independent_watchdog",
});
const TRACKING_ESCALATION_OWNER_BY_NODE = Object.freeze({
  gate_five_field: "five_field_owner",
  store_workmeta: "workmeta_owner",
  watchtower_self: "watchtower_owner",
});
const TRACKING_REASON_BY_NODE = Object.freeze({
  gate_five_field: "event_validation_receipt_absent",
  store_workmeta: "owner_bounded_validation_receipt_absent",
});

// mail 계정별 요약(logs/last_run_summary.json)을 훑어 실패 계정을 사람 말로
// 특정한다. 주소·경로·원문은 절대 싣지 않는다 — 라벨(owner 제공) 또는 별칭만.
export async function collectMailAccountDetails(detail) {
  const labels = detail.account_labels ?? {};
  const reasons = [];
  let entries;
  try {
    entries = await readdir(detail.path, { withFileTypes: true });
  } catch {
    return { reasons: [], scanned: 0 };
  }
  let scanned = 0;
  for (const entry of entries) {
    if (!entry.isDirectory() || !/^acc_[a-z0-9_]+$/u.test(entry.name)) continue;
    scanned += 1;
    try {
      const summaryPath = join(detail.path, entry.name, "logs", "last_run_summary.json");
      const { text } = await readBoundedFile(summaryPath);
      const summary = JSON.parse(text);
      const codes = new Set();
      const harvest = (value) => {
        if (Array.isArray(value)) {
          for (const item of value) harvest(item);
          return;
        }
        if (value === null || typeof value !== "object") return;
        for (const code of Array.isArray(value.error_codes) ? value.error_codes : []) {
          if (typeof code === "string" && SAFE_ERROR_CODE.test(code)) codes.add(code);
        }
        if (typeof value.code === "string" && SAFE_ERROR_CODE.test(value.code)) codes.add(value.code);
      };
      harvest(summary.sources);
      harvest(summary.errors);
      const partial = summary.partial === true
        || (Array.isArray(summary.sources) && summary.sources.some((source) => source?.partial === true));
      if (partial || codes.size > 0) {
        const label = labels[entry.name] ?? entry.name;
        const codeText = codes.size > 0 ? [...codes].sort().join("/") : "partial";
        reasons.push(`메일 계정 ${label}: ${codeText}`);
      }
    } catch {
      continue;
    }
  }
  return { reasons: reasons.sort(), scanned };
}

// ── PLAUD 녹음 신선도 ──────────────────────────────────────────────────────────
// 기기→클라우드 업로드 공백은 다른 어떤 probe 로도 보이지 않는다. 5-lane 감독자는
// 매 회차 PLAUD 카탈로그를 정상으로 읽으므로(연결·로그인 검사는 거기서 이미 한다),
// 기기가 며칠째 아무것도 올리지 않아도 그 하트비트는 계속 초록이다. 그래서 이 probe 는
// 하트비트가 아니라 라이브러리 색인의 **최신 녹음일(KST)** 을 기대 평일과 비교한다.
// 원인 구분은 감독자 health 를 함께 읽어서 붙인다 — 읽기 전용이며 아무것도 고치지 않는다.

export const PLAUD_FRESHNESS_POLICY_SCHEMA_VERSION = "soulforge.watchtower.plaud_freshness_policy.v0";
// 기본값: 월~금(KST)에는 무조건 녹음하고, 주말·공휴일에는 쓰지 않는다. 기대 평일의 녹음이
// 다음 날 정오까지 들어오지 않으면 더 기다리지 않는다.
export const DEFAULT_PLAUD_FRESHNESS_POLICY = Object.freeze({
  expected_weekdays: Object.freeze([1, 2, 3, 4, 5]),
  cutoff_hour_kst: 12,
  holiday_dates: Object.freeze([]),
});
// 감독자가 이 시간 안에 PLAUD 를 실제로 읽었다면 API·로그인은 살아 있다고 본다.
// 감독자 회차는 ~6분이므로 30분은 몇 회차 연속 실패를 요구하는 값이다.
const PLAUD_INGRESS_SUCCESS_MAX_AGE_SECONDS = 1800;
// 감독자가 PLAUD 를 아예 읽지 못했다고 말하는 상태들. `degraded` 는 여기 없다 —
// custody 미완성·백필 잔량처럼 연결과 무관한 이유로도 붙는 단어이기 때문이다.
const PLAUD_LANE_HARD_FAILURE_STATES = new Set(["failed", "blocked", "unknown", "stale"]);
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/u;
const MAX_EXPECTED_DAY_LOOKBACK = 400;

function kstDayStartMs(dateIso) {
  return Date.parse(`${dateIso}T00:00:00.000Z`) - KST_OFFSET_MS;
}

// KST 는 고정 +09:00 이므로 epoch 를 그만큼 밀고 UTC 게터로 읽으면 실행 호스트의
// 표준시와 무관하게 같은 답이 나온다. 시험이 시각을 주입할 수 있는 이유이기도 하다.
function kstCivil(nowMs) {
  const shifted = new Date(nowMs + KST_OFFSET_MS);
  return {
    date: shifted.toISOString().slice(0, 10),
    hour: shifted.getUTCHours(),
  };
}

function shiftIsoDate(dateIso, days) {
  return new Date(Date.parse(`${dateIso}T00:00:00.000Z`) + days * 86_400_000)
    .toISOString().slice(0, 10);
}

function isoWeekday(dateIso) {
  return new Date(Date.parse(`${dateIso}T00:00:00.000Z`)).getUTCDay();
}

/** 오늘(KST) 이전의 가장 최근 기대 평일. 공휴일은 건너뛴다. 없으면 null. */
export function previousExpectedRecordingDate(todayIso, policy) {
  const holidays = new Set(policy.holiday_dates);
  let cursor = shiftIsoDate(todayIso, -1);
  for (let step = 0; step < MAX_EXPECTED_DAY_LOOKBACK; step += 1) {
    if (policy.expected_weekdays.includes(isoWeekday(cursor)) && !holidays.has(cursor)) return cursor;
    cursor = shiftIsoDate(cursor, -1);
  }
  return null;
}

/**
 * 정책 문서를 읽을 수 있는 값으로 바꾼다. 파일이 없으면 기본값이고(그건 정상 상태다),
 * 있는데 모양이 틀리면 기본값으로 판정하되 그 사실을 사유로 드러낸다. 조용한 fallback 을
 * 만들지 않는다 — 손으로 고친 정책이 무시되고 있는 것을 사람이 알아야 한다.
 */
export function normalisePlaudFreshnessPolicy(value) {
  const invalid = { policy: DEFAULT_PLAUD_FRESHNESS_POLICY, policy_invalid: true };
  if (value === null || typeof value !== "object" || Array.isArray(value)) return invalid;
  if (value.schema_version !== PLAUD_FRESHNESS_POLICY_SCHEMA_VERSION) return invalid;
  const weekdays = value.expected_weekdays;
  if (!Array.isArray(weekdays) || weekdays.length === 0
    || weekdays.some((day) => !Number.isSafeInteger(day) || day < 0 || day > 6)) return invalid;
  const cutoff = value.cutoff_hour_kst;
  if (!Number.isSafeInteger(cutoff) || cutoff < 0 || cutoff > 23) return invalid;
  const holidays = value.holiday_dates;
  if (!Array.isArray(holidays) || holidays.some((date) => typeof date !== "string" || !ISO_DATE.test(date))) {
    return invalid;
  }
  return {
    policy: {
      expected_weekdays: [...new Set(weekdays)],
      cutoff_hour_kst: cutoff,
      holiday_dates: [...holidays],
    },
    policy_invalid: false,
  };
}

// 공백이 실제로 무엇인지 사람 말로 좁힌다. 감독자가 최근에 PLAUD 회차를 성공시켰다면
// 연결·로그인은 살아 있는 것이므로 남는 설명은 기기 업로드 공백이다.
function plaudGapCauseReasons(health, healthError, now) {
  if (healthError !== null) return ["plaud_ingress_health_unavailable", healthError];
  if (health?.plaud_enabled === false) return ["plaud_collection_disabled"];
  const status = typeof health?.plaud_status === "string" ? health.plaud_status : null;
  const ageSeconds = (field) => {
    const parsed = typeof health?.[field] === "string" ? Date.parse(health[field]) : Number.NaN;
    return Number.isFinite(parsed) ? (now - parsed) / 1000 : Infinity;
  };
  // `plaud_status: ok` 만으로 연결을 판정하면 틀린다. 감독자는 custody 미완성 같은
  // 연결과 무관한 이유로도 회차를 degraded 로 내리고(continuous_runner.mjs),
  // `plaud_last_success_at` 은 회차 전체가 ok 일 때만 전진하므로 실제로는 매 회차
  // 카탈로그를 정상으로 읽고 있는데도 그 시각이 계속 늙는다. 그러면 기기 업로드 공백이
  // 로그인 실패로 보고되어 사람을 엉뚱한 곳으로 보낸다. 그래서 두 가지 증거 중 하나면
  // 연결이 살아 있다고 본다: 최근의 완전 성공 회차, 또는 최근 회차에서 카탈로그를
  // 끝까지 읽었다는 사실. 감독자가 아예 못 읽었다고 말하는 상태는 둘 다 무효로 만든다.
  const recentFullSuccess = ageSeconds("plaud_last_success_at") <= PLAUD_INGRESS_SUCCESS_MAX_AGE_SECONDS;
  const recentCatalogRead = health?.plaud_catalog_complete === true
    && ageSeconds("observed_at") <= PLAUD_INGRESS_SUCCESS_MAX_AGE_SECONDS;
  const reachable = status !== null && !PLAUD_LANE_HARD_FAILURE_STATES.has(status)
    && (recentFullSuccess || recentCatalogRead);
  const reasons = [reachable ? "device_upload_gap_suspected" : "plaud_api_or_login_failure"];
  if (status !== null && status !== "ok") {
    reasons.push(`plaud_supervisor_status_${status.replace(/[^a-z0-9_]/giu, "_").slice(0, 32)}`);
  }
  for (const code of Array.isArray(health?.error_codes) ? health.error_codes : []) {
    if (typeof code === "string" && SAFE_ERROR_CODE.test(code) && /^(?:plaud|auth)_/u.test(code)) {
      reasons.push(code);
    }
  }
  return reasons;
}

/**
 * 순수 판정기. I/O 를 하지 않으므로 시험이 시각·색인·정책·감독자 health 를 그대로 준다.
 * @param {object} input
 * @param {number} input.now                      epoch ms
 * @param {string} input.latest_recording_date     색인 안 최대 `recording_date` (KST 녹음일)
 * @param {object} input.policy                    normalisePlaudFreshnessPolicy 의 policy
 * @param {boolean} input.policy_invalid
 * @param {object|null} input.ingress_health       continuous_ingress.json 레코드
 * @param {string|null} input.ingress_health_error 읽지 못한 사유 코드
 */
export function judgePlaudRecordingFreshness({
  now,
  latest_recording_date: latest,
  policy = DEFAULT_PLAUD_FRESHNESS_POLICY,
  policy_invalid: policyInvalid = false,
  ingress_health: health = null,
  ingress_health_error: healthError = null,
}) {
  const reasons = [];
  if (policyInvalid) reasons.push("plaud_freshness_policy_invalid");
  const today = kstCivil(now);
  const required = previousExpectedRecordingDate(today.date, policy);
  const ageSeconds = Math.max(0, Math.round((now - kstDayStartMs(latest)) / 1000));
  const dates = { latest_recording_date: latest, required_recording_date: required };
  if (required === null) {
    return {
      state: "down",
      reasons: [...reasons, "plaud_freshness_policy_unsatisfiable"],
      age_seconds: ageSeconds,
      ...dates,
    };
  }
  if (latest >= required) {
    return {
      state: reasons.length > 0 ? "degraded" : "ok",
      reasons,
      age_seconds: ageSeconds,
      ...dates,
    };
  }
  // 기대 평일의 녹음이 없다. 다음 날 정오(정책값)까지는 아직 동기화 중일 수 있으므로
  // 열화로 두고, 그 시각을 넘기면 사람이 확인해야 하는 stale 이다.
  const syncDeadlineMs = kstDayStartMs(shiftIsoDate(required, 1)) + policy.cutoff_hour_kst * 3_600_000;
  const state = now < syncDeadlineMs ? "degraded" : "stale";
  reasons.push(state === "degraded"
    ? "plaud_recording_not_yet_synced"
    : `plaud_no_weekday_recording_since:${latest}`);
  reasons.push(...plaudGapCauseReasons(health, healthError, now));
  return { state, reasons, age_seconds: ageSeconds, ...dates };
}

async function readOptionalJsonRecord(path) {
  let text;
  try {
    ({ text } = await readBoundedFile(path));
  } catch {
    return { record: null, error: "source_missing" };
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { record: null, error: "source_invalid_json" };
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { record: null, error: "source_invalid_record" };
  }
  return { record: parsed, error: null };
}

async function probePlaudRecordingFreshness(probe, now) {
  let latest = null;
  try {
    const { text } = await readBoundedFile(probe.path);
    let index;
    try {
      index = JSON.parse(text);
    } catch {
      fail("source_invalid_json", "invalid library index");
    }
    plainObject(index, "source_invalid_record");
    if (typeof probe.expected_schema_version === "string"
      && index.schema_version !== probe.expected_schema_version) {
      fail("source_schema_invalid", "unexpected library index schema_version");
    }
    if (!Array.isArray(index.recordings)) fail("plaud_index_recordings_invalid", "recordings is not a list");
    for (const row of index.recordings) {
      const value = row === null || typeof row !== "object" ? undefined : row.recording_date;
      if (typeof value === "string" && ISO_DATE.test(value) && (latest === null || value > latest)) {
        latest = value;
      }
    }
    if (latest === null) fail("plaud_index_no_recording_date", "index carries no dated recording");
  } catch (error) {
    const code = error instanceof WatchtowerError ? error.code : "source_missing";
    return { state: "down", reasons: [code], age_seconds: null };
  }

  // 정책 파일은 없어도 된다(기본값이 곧 owner 의 규칙이다). 감독자 health 는 읽지 못하면
  // 원인 구분을 못 한다는 사실 자체를 사유로 남긴다.
  const policyRead = typeof probe.policy_path === "string"
    ? await readOptionalJsonRecord(probe.policy_path)
    : { record: null, error: "source_missing" };
  const policy = policyRead.error === "source_missing"
    ? { policy: DEFAULT_PLAUD_FRESHNESS_POLICY, policy_invalid: false }
    : normalisePlaudFreshnessPolicy(policyRead.record);
  const healthRead = await readOptionalJsonRecord(probe.health_path);

  return judgePlaudRecordingFreshness({
    now,
    latest_recording_date: latest,
    ...policy,
    ingress_health: healthRead.record,
    ingress_health_error: healthRead.error,
  });
}

export async function runProbe(probe, { now, run_schtasks: runSchtasks }) {
  const reasons = [];
  let observedAtMs = null;
  let record = null;

  if (probe.kind === "schtask") {
    const state = await schtaskState(probe, runSchtasks);
    const verdict = judgeTaskOwner(state, probe.operation_mode === "scheduled" ? "scheduled" : "resident");
    return verdict.state === "ok"
      ? { state: "ok", reasons: [], age_seconds: 0 }
      : { state: verdict.state, reasons: [verdict.reason], age_seconds: null };
  }

  const taskOwner = await judgeProbeTaskOwner(probe, runSchtasks);
  if (taskOwner?.state === "down") {
    return { state: "down", reasons: [taskOwner.reason], age_seconds: null };
  }
  if (taskOwner?.state === "unmonitored") {
    return { state: "unmonitored", reasons: [taskOwner.reason], age_seconds: null };
  }

  if (probe.kind === "plaud_recording_freshness") return probePlaudRecordingFreshness(probe, now);

  try {
    if (probe.kind === "json_file") {
      const result = await probeJsonFile(probe);
      record = result.record;
      observedAtMs = result.mtimeMs;
    } else if (probe.kind === "jsonl_tail") {
      const result = await probeJsonlTail(probe);
      record = result.record;
      observedAtMs = result.mtimeMs;
    } else {
      const newest = await newestMtimeUnder(probe.path, 3, { count: 0 });
      if (newest === null) fail("source_empty", "no files under directory");
      observedAtMs = newest;
    }
  } catch (error) {
    const code = error instanceof WatchtowerError ? error.code : "source_missing";
    if (probe.missing_is_unmonitored === true) {
      return { state: "unmonitored", reasons: ["heartbeat_receipt_unavailable", code], age_seconds: null };
    }
    return { state: "down", reasons: [code], age_seconds: null };
  }

  if (record !== null && typeof probe.timestamp_field === "string") {
    const raw = fieldPath(record, probe.timestamp_field);
    const parsed = typeof raw === "string" ? Date.parse(raw) : Number.NaN;
    if (Number.isFinite(parsed)) observedAtMs = parsed;
  }

  const ageSeconds = Math.max(0, Math.round((now - observedAtMs) / 1000));
  const window = judgeWindow(ageSeconds, probe);
  if (window === "stale") {
    const staleReasons = ["heartbeat_stale"];
    if (record !== null && Array.isArray(record.error_codes)) {
      for (const code of record.error_codes) {
        if (typeof code === "string" && SAFE_ERROR_CODE.test(code)) staleReasons.push(code);
      }
    }
    const result = { state: "stale", reasons: staleReasons, age_seconds: ageSeconds };
    return result;
  }
  if (window === "late") reasons.push("heartbeat_late");

  if (record !== null && typeof probe.status_field === "string") {
    const status = fieldPath(record, probe.status_field);
    const okValues = Array.isArray(probe.ok_values) ? probe.ok_values : ["ok"];
    if (typeof status === "string" && !okValues.includes(status)) {
      reasons.push(`status_${status.replace(/[^a-z0-9_]/giu, "_").slice(0, 32)}`);
    }
  }
  if (record !== null && Array.isArray(probe.degrade_when)) {
    for (const rule of probe.degrade_when) {
      const value = fieldPath(record, rule.field);
      if (Number.isFinite(value) && value > rule.above) {
        reasons.push(`count_${rule.field.split(".").at(-1)}_${value}`);
      }
    }
  }
  // heartbeat record가 안전 코드(error_codes)를 실어 오면 판정 사유로 그대로 노출한다.
  if (record !== null && Array.isArray(record.error_codes)) {
    for (const code of record.error_codes) {
      if (typeof code === "string" && SAFE_ERROR_CODE.test(code)) reasons.push(code);
    }
  }

  if (probe.detail !== undefined) {
    const details = await collectMailAccountDetails(probe.detail);
    reasons.push(...details.reasons);
  }

  let activityState = record?.activity_changed === true ? "collecting"
    : record?.activity_changed === false ? "idle" : null;
  let activityCount;
  let activityNextAt;
  if (record !== null && typeof probe.activity_field === "string") {
    const observedActivityState = fieldPath(record, probe.activity_field);
    if (observedActivityState !== undefined && observedActivityState !== null) {
      if (!probe.activity_values.includes(observedActivityState)) {
        reasons.push("activity_state_invalid");
        activityState = null;
      } else {
        activityState = observedActivityState;
      }
      if (typeof probe.activity_count_field === "string") {
        const observedActivityCount = fieldPath(record, probe.activity_count_field);
        if (observedActivityCount !== undefined && observedActivityCount !== null) {
          if (!Number.isSafeInteger(observedActivityCount) || observedActivityCount < 0) {
            reasons.push("activity_count_invalid");
          } else {
            activityCount = observedActivityCount;
          }
        }
      }
      if (typeof probe.activity_next_at_field === "string") {
        const observedActivityNextAt = fieldPath(record, probe.activity_next_at_field);
        if (observedActivityNextAt === null) {
          activityNextAt = null;
        } else if (observedActivityNextAt !== undefined) {
          if (typeof observedActivityNextAt !== "string"
            || !Number.isFinite(Date.parse(observedActivityNextAt))) {
            reasons.push("activity_next_at_invalid");
          } else {
            activityNextAt = observedActivityNextAt;
          }
        }
      }
    }
  }
  return {
    state: reasons.length > 0 ? "degraded" : "ok",
    reasons,
    age_seconds: ageSeconds,
    ...(activityState === null ? {} : { activity_state: activityState }),
    ...(activityCount === undefined ? {} : { activity_count: activityCount }),
    ...(activityNextAt === undefined ? {} : { activity_next_at: activityNextAt }),
  };
}

function trackingReasonCode(node, health) {
  if (health.state === "unmonitored" && TRACKING_REASON_BY_NODE[node.id] !== undefined) {
    return TRACKING_REASON_BY_NODE[node.id];
  }
  const supported = health.reasons.find((reason) => typeof reason === "string" && SAFE_ERROR_CODE.test(reason));
  return supported ?? `health_${health.state}`;
}

function nonGreenTracking(node, health, probe, observedAtMs) {
  const isIndependentEvidenceAbsence = health.state === "unmonitored"
    && ["watchtower_self", "gate_five_field", "store_workmeta"].includes(node.id);
  const isStructuralAbsence = health.state === "unmonitored"
    && (node.probe === null || isIndependentEvidenceAbsence);
  const evidenceOwner = TRACKING_EVIDENCE_OWNER_BY_NODE[node.id]
    ?? (node.health_scope === "provider" ? `${node.provider}_provider_owner`
      : probe !== undefined ? "watchtower_probe"
        : node.probe === null ? "declared_node_owner" : "watchtower_binding_owner");
  const escalationOwner = TRACKING_ESCALATION_OWNER_BY_NODE[node.id]
    ?? (node.health_scope === "provider" ? `${node.provider}_provider_owner`
      : node.probe === null ? "node_owner" : "watchtower_operator");
  const lastCheckedAt = new Date(observedAtMs).toISOString();
  const nextCheckAt = new Date(
    observedAtMs + WATCHTOWER_CHECK_INTERVAL_SECONDS * 1000,
  ).toISOString();
  const nextEvidenceDueAt = probe !== undefined
    && Number.isSafeInteger(probe.period_seconds)
    && Number.isFinite(health.age_seconds)
    ? new Date(
      observedAtMs - health.age_seconds * 1000 + probe.period_seconds * 1000,
    ).toISOString()
    : null;
  return {
    node_id: node.id,
    reason_code: trackingReasonCode(node, health),
    evidence_owner: evidenceOwner,
    last_checked_at: lastCheckedAt,
    next_check_at: nextCheckAt,
    next_evidence_due_at: nextEvidenceDueAt,
    repairability: isStructuralAbsence ? "not_available" : "manual",
    repair_action: null,
    verification_state: health.state === "unmonitored" ? "evidence_absent" : "observed",
    escalation_owner: escalationOwner,
  };
}

export async function composeTopologyHealth(binding, options = {}) {
  validateWatchtowerBinding(binding);
  const now = Number.isFinite(options.now) ? options.now : Date.now();
  const runSchtasks = typeof options.run_schtasks === "function" ? options.run_schtasks : defaultRunSchtasks;
  const skeleton = topologySkeleton();
  const deliveryOptions = {
    receipts: options.receipts ?? {},
    windows: options.receipt_windows ?? {},
    now,
  };
  const nodes = [];
  const summary = Object.fromEntries(HEALTH_STATES.map((state) => [state, 0]));

  for (const node of skeleton.nodes) {
    let health;
    if (node.probe === null) {
      health = { state: "unmonitored", reasons: [node.unmonitored_reason], age_seconds: null };
    } else {
      const probe = binding.probes[node.probe];
      health = probe === undefined
        ? { state: "unmonitored", reasons: [node.unmonitored_reason, "probe_unbound"], age_seconds: null }
        : await runProbe(probe, { now, run_schtasks: runSchtasks });
    }
    summary[health.state] += 1;
    const projectedNode = {
      id: node.id,
      label: node.label,
      kind: node.kind,
      group: node.group,
      operation_mode: node.operation_mode,
      health_scope: node.health_scope,
      col: node.col,
      row: node.row,
      health,
    };
    if (node.provider !== undefined) projectedNode.provider = node.provider;
    if (health.state !== "ok") {
      projectedNode.tracking = nonGreenTracking(node, health, binding.probes[node.probe], now);
    }
    nodes.push(projectedNode);
  }

  return {
    schema_version: WATCHTOWER_SNAPSHOT_SCHEMA_VERSION,
    observed_at: new Date(now).toISOString(),
    summary,
    nodes,
    edges: skeleton.edges.map((edge) => ({
      ...edge,
      delivery: edgeDeliveryVerdict(edge, deliveryOptions),
    })),
    edge_delivery: summariseEdgeDelivery(skeleton.edges, deliveryOptions),
  };
}

export function assertSnapshotPathFree(snapshot, binding) {
  const text = JSON.stringify(snapshot);
  const leaks = [];
  if (/[A-Za-z]:\\|\\\\[^\\]|\/(?:Users|home|var|tmp|private|Volumes)\//u.test(text)) leaks.push("absolute_path");
  const boundPaths = [binding.state_root];
  for (const probe of Object.values(binding.probes)) {
    for (const candidate of [probe.path, probe.detail?.path, probe.health_path, probe.policy_path]) {
      if (typeof candidate === "string") boundPaths.push(candidate);
    }
  }
  if (boundPaths.some((boundPath) => typeof boundPath === "string" && boundPath.length > 3 && text.includes(boundPath))) {
    leaks.push("probe_path");
  }
  const prohibitedKeys = /^(?:prompt|reasoning|tool_(?:input|output)|transcript(?:_path)?|session_path|source_path|cwd)$/u;
  const visit = (value) => {
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }
    if (value === null || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value)) {
      if (prohibitedKeys.test(key)) leaks.push("raw_field");
      visit(child);
    }
  }
  visit(snapshot);
  if (leaks.length > 0) fail("snapshot_path_leak", [...new Set(leaks)].join(","));
  return snapshot;
}

export async function writeTopologyHealthSnapshot(binding, snapshot) {
  const target = join(binding.state_root, "snapshot", "topology_health.v2.json");
  await mkdir(dirname(target), { recursive: true });
  const temp = `${target}.tmp`;
  await writeFile(temp, JSON.stringify(snapshot, null, 2), "utf8");
  await rename(temp, target);
  return target;
}

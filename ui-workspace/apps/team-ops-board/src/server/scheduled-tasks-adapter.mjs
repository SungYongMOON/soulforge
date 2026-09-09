// scheduled-tasks-adapter.mjs — Bellows(예약 작업) 목록을 loopback 전용
// GET /scheduled-tasks.snapshot.json 으로 투영하는 Vite dev/preview 플러그인.
//
// 읽기 전용이다. 작업을 만들지도, 지우지도, 실행하지도, 멈추지도 않는다. 유일한
// 바깥 호출은 PowerShell 구조화 조회 한 번이며 60초 TTL 캐시와 단일 비행으로
// 억제한다. Windows가 아니거나 호출이 실패하면 fail-closed `unavailable` 이다.
//
// 이전에는 `schtasks /query /fo csv /v` 콘솔 텍스트를 직접 파싱했다. 그 CSV는
// 다른 작업의 "실행할 작업" 칸에 이스케이프되지 않은 `"` 하나만 있어도 뒤따르는
// 여러 물리 줄이 한 행으로 합쳐졌고, 합쳐진 행은 이름 칸이 밀려 조용히
// 탈락하면서도 endpoint 는 `state: "ready"` 를 냈다(2026-09-06 이 호스트 실측:
// Soulforge-* 11개 전부가 이렇게 유실되었는데 summary.total 은 9로 "정상"처럼
// 보였다). 지금은 텍스트를 전혀 파싱하지 않는다: `Get-ScheduledTask` 개체에서
// 이름 붙은 속성 다섯 개만 골라 JSON 으로 낸다 — 열 위치도, 따옴표 이스케이프도
// 없으므로 그 파싱 층 자체가 없다.
//
// 무엇이 브라우저까지 가는가 (allowlist). PowerShell 스크립트 자체가 이 다섯
// 필드만 선택한다 — Actions(명령행·인자), Principal(계정), Author, TaskPath,
// HostName 은 애초에 고르지 않으므로 뒤 단계가 실수로라도 흘릴 경로가 없다:
//   name           `$_.TaskName` — Get-ScheduledTask 가 이미 폴더 경로를 뺀
//                  마지막 마디만 낸다.
//   state          `[string]$_.State` — 닫힌 .NET enum 이름(Ready/Running/
//                  Disabled/Queued/Unknown)이며 콘솔 로캘과 무관하다.
//   last_run_at    Get-ScheduledTaskInfo 의 LastRunTime 을 고정 포맷 문자열로.
//   last_result    LastTaskResult, 정수.
//   next_run_at    NextRunTime 을 같은 고정 포맷 문자열로.
// 여기서 두 필드를 더 파생한다: healthy(결과 코드·상태에서), trigger_count(같은
// 이름의 개체가 몇 개 겹쳤는지 — 서로 다른 폴더에 동명 작업이 있는 드문 경우).
//
// 이름은 다시 한번 검사한다: PowerShell 의 Where-Object 선별은 트래픽을 줄이는
// 최적화일 뿐 집행 지점이 아니다. Node 쪽에서 이름이 정규식(NAME_RE)을 통과하지
// 못하면 — 즉 그 자리에 예상 밖의 값이 와 있다면 — 개별 행을 조용히 건너뛰지
// 않고 투영 전체를 `scheduled_tasks_output_malformed` 로 닫는다. 반대로 이름이
// 정규식은 통과했지만 allowlist 접두사 밖이면(이 host의 다른 소프트웨어) 그
// 작업 하나만 조용히 뺀다 — 이건 고장이 아니라 원래 하는 일이다.
//
// 이름 allowlist: `Soulforge-`, `Buzz`, `Hermes` 로 시작하는 작업만 본다. 이 호스트의
// 다른 예약 작업(사무용 소프트웨어, 드라이버 갱신기 등)은 Vigil 의 관심사가 아니고
// 이름 자체가 사용자 환경을 드러낼 수 있다.
//
// 출력이 조금이라도 비정상이면 — JSON 파싱 실패, 다섯 필드 중 하나라도 누락·
// 여분이거나 모양이 틀림, 유효 행 수와 원본 행 수의 불일치 — 부분 목록을
// `ready` 로 내지 않고 전체를 `unavailable`(`scheduled_tasks_output_malformed`)
// 로 닫는다. 근거가 모자란 상태를 완결된 답처럼 보이게 하지 않는다.

import { spawn } from "node:child_process";
import process from "node:process";
import { isDirectLoopbackRequest } from "./loopback-request-guard.mjs";

export const SCHEDULED_TASKS_SNAPSHOT_PATH = "/scheduled-tasks.snapshot.json";
export const SCHEDULED_TASKS_PROJECTION_SCHEMA = "soulforge.team_ops_board.scheduled_tasks_projection.v1";
export const DEFAULT_SCHEDULED_TASKS_TTL_MS = 60_000;
export const DEFAULT_SCHEDULED_TASKS_TIMEOUT_MS = 20_000;
export const SCHEDULED_TASKS_NAME_PREFIXES = Object.freeze(["Soulforge-", "Buzz", "Hermes"]);
export const SCHEDULED_TASKS_MAX = 200;

const MAX_STDOUT_BYTES = 8 * 1024 * 1024;
const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9 _.-]{0,79}$/u;

// 결과 코드 중 고장이 아닌 것. 0 = 성공, 267009 = 지금 실행 중,
// 267011 = 아직 한 번도 실행되지 않음.
const BENIGN_LAST_RESULTS = Object.freeze(new Set([0, 267009, 267011]));

// Get-ScheduledTask 의 State enum 이름은 닫힌 집합(Ready/Running/Disabled/
// Queued/Unknown)이고 .NET enum 이름이라 콘솔 로캘과 무관하다(2026-09-06 이
// 호스트에서 실측: 한국어 콘솔에서도 영어 이름이 그대로 나온다). 그래도 이
// 표는 남겨 둔다 — 값이 하나라도 못 알아보는 문자열이면 개별 행의 상태만
// `Unknown` 으로 접힐 뿐 healthy 판정은 결과 코드가 하므로 초록이 잘못
// 켜지지 않는다.
const STATUS_BY_LOCALE_FORM = Object.freeze({
  ready: "Ready",
  running: "Running",
  disabled: "Disabled",
  queued: "Queued",
  unknown: "Unknown",
  "준비": "Ready",
  "실행 중": "Running",
  "실행중": "Running",
  "사용 안 함": "Disabled",
  "사용안함": "Disabled",
  "대기 중": "Queued",
  "대기중": "Queued",
});

// PowerShell 스크립트가 낸 행 하나의 모양. 하나라도 벗어나면(키 누락·여분·
// 타입 불일치) 그 행 하나를 건너뛰지 않고 투영 전체를 닫는다 — 파서가 없어도
// 배달 계약(JSON 모양)이 깨지면 나머지 행이 맞다는 보장도 없기 때문이다.
const ROW_KEYS = Object.freeze(["last_result", "last_run_at", "name", "next_run_at", "state"]);

// `2026-09-06 오전 2:00:01` / `2026-09-06 2:00:01 AM` / `N/A` 를 로캘 없는
// `YYYY-MM-DD HH:MM` 으로 접는다. 읽히지 않으면 원문을 흘리지 않고 null 을 낸다.
// (PowerShell 쪽은 이미 `ToString('yyyy-MM-dd HH:mm')` 고정 포맷으로 내므로
// AM/PM·오전/오후 분기는 실제로는 타지 않는다 — 그래도 이 함수 자체는 범용
// 유틸이라 그대로 둔다. 못 읽는 값은 이 함수가 이미 null 로 접어 그 자체로
// fail-safe 다.)
const TIME_RE = /^(\d{4})-(\d{1,2})-(\d{1,2})\s+(?:(오전|오후|AM|PM|am|pm)\s*)?(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*(AM|PM|am|pm))?$/u;

export function normalizeScheduledTaskTime(raw) {
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  if (value.length === 0 || value.length > 48) return null;
  const match = TIME_RE.exec(value);
  if (match === null) return null;
  const [, year, month, day, leadMarker, hourText, minute, , trailMarker] = match;
  const marker = (leadMarker ?? trailMarker ?? "").toUpperCase();
  let hour = Number(hourText);
  if (!Number.isSafeInteger(hour) || hour < 0 || hour > 23) return null;
  if (marker === "오후" || marker === "PM") {
    if (hour < 12) hour += 12;
  } else if (marker === "오전" || marker === "AM") {
    if (hour === 12) hour = 0;
  }
  const pad = (part) => String(part).padStart(2, "0");
  const monthNumber = Number(month);
  const dayNumber = Number(day);
  if (monthNumber < 1 || monthNumber > 12 || dayNumber < 1 || dayNumber > 31) return null;
  return `${year}-${pad(monthNumber)}-${pad(dayNumber)} ${pad(hour)}:${minute}`;
}

export function normalizeScheduledTaskName(raw, prefixes = SCHEDULED_TASKS_NAME_PREFIXES) {
  if (typeof raw !== "string") return null;
  // 폴더 경로는 버리고 마지막 마디만 남긴다(Get-ScheduledTask 의 TaskName 은
  // 이미 마지막 마디뿐이지만, 이 유틸은 범용이라 그대로 둔다).
  const leaf = raw.split("\\").filter((part) => part.length > 0).pop() ?? "";
  const name = leaf.trim();
  if (!NAME_RE.test(name)) return null;
  if (!prefixes.some((prefix) => name.startsWith(prefix))) return null;
  return name;
}

function normalizeStatus(raw) {
  if (typeof raw !== "string") return "Unknown";
  const key = raw.trim().toLowerCase();
  return STATUS_BY_LOCALE_FORM[key] ?? STATUS_BY_LOCALE_FORM[raw.trim()] ?? "Unknown";
}

function normalizeTaskResultCode(raw) {
  return typeof raw === "number" && Number.isSafeInteger(raw) ? raw : null;
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

// 합성 JSON 으로도 그대로 검증되는 순수 함수. 여기가 allowlist 의 집행 지점이다.
// jsonText 는 PowerShell 이 `ConvertTo-Json -Compress` 로 낸 텍스트다: 매치가
// 없으면 빈 문자열, 하나면 개체 하나, 여럿이면 배열이다(Windows PowerShell
// 5.1 의 실측 동작 — `-AsArray` 는 이 버전에 없다).
export function projectScheduledTasksJson(jsonText, {
  prefixes = SCHEDULED_TASKS_NAME_PREFIXES,
  maxTasks = SCHEDULED_TASKS_MAX,
} = {}) {
  const text = typeof jsonText === "string" ? jsonText.trim() : "";
  if (text.length === 0) {
    // 매치가 없으면 PowerShell 은 아무 것도 내지 않는다(실측) — 이건 고장이
    // 아니라 이 host에 allowlist 접두사로 시작하는 작업이 없다는 뜻이다.
    return { tasks: [], truncated: false, reason: null };
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { tasks: [], truncated: false, reason: "scheduled_tasks_output_malformed" };
  }

  let rawRows;
  if (parsed === null) {
    rawRows = [];
  } else if (Array.isArray(parsed)) {
    rawRows = parsed;
  } else if (isPlainObject(parsed)) {
    // 매치가 정확히 하나면 ConvertTo-Json 은 배열이 아니라 개체 하나를 낸다.
    rawRows = [parsed];
  } else {
    return { tasks: [], truncated: false, reason: "scheduled_tasks_output_malformed" };
  }

  const validated = [];
  for (const rawRow of rawRows) {
    if (!isPlainObject(rawRow)) {
      return { tasks: [], truncated: false, reason: "scheduled_tasks_output_malformed" };
    }
    const keys = Object.keys(rawRow).sort();
    const sameKeys = keys.length === ROW_KEYS.length && keys.every((key, index) => key === ROW_KEYS[index]);
    if (!sameKeys) {
      return { tasks: [], truncated: false, reason: "scheduled_tasks_output_malformed" };
    }
    const { name, state, last_run_at: lastRunAt, last_result: lastResult, next_run_at: nextRunAt } = rawRow;
    if (typeof name !== "string" || typeof state !== "string") {
      return { tasks: [], truncated: false, reason: "scheduled_tasks_output_malformed" };
    }
    if (lastRunAt !== null && typeof lastRunAt !== "string") {
      return { tasks: [], truncated: false, reason: "scheduled_tasks_output_malformed" };
    }
    if (nextRunAt !== null && typeof nextRunAt !== "string") {
      return { tasks: [], truncated: false, reason: "scheduled_tasks_output_malformed" };
    }
    if (lastResult !== null && typeof lastResult !== "number") {
      return { tasks: [], truncated: false, reason: "scheduled_tasks_output_malformed" };
    }
    const trimmedName = name.trim();
    if (!NAME_RE.test(trimmedName)) {
      // 이름이 기본 모양(NAME_RE)조차 통과하지 못한다 — 이 자리에 예상 밖의
      // 값이 와 있다는 신호이므로 조용히 건너뛰지 않고 전체를 닫는다.
      return { tasks: [], truncated: false, reason: "scheduled_tasks_output_malformed" };
    }
    if (!prefixes.some((prefix) => trimmedName.startsWith(prefix))) {
      // 모양은 멀쩡하지만 allowlist 밖 — 이 host의 다른 작업일 뿐이다. 이건
      // 정상 동작이므로 이 행 하나만 조용히 뺀다(투영 전체를 닫지 않는다).
      continue;
    }
    validated.push({
      name: trimmedName,
      status: normalizeStatus(state),
      last_run_at: normalizeScheduledTaskTime(lastRunAt),
      last_result: normalizeTaskResultCode(lastResult),
      next_run_at: normalizeScheduledTaskTime(nextRunAt),
    });
  }

  const byName = new Map();
  let truncated = false;
  for (const entry of validated) {
    const existing = byName.get(entry.name);
    if (existing !== undefined) {
      existing.trigger_count += 1;
      // 서로 다른 폴더의 동명 작업 중 가장 이른 다음 실행이 진짜 다음 실행이다.
      if (entry.next_run_at !== null && (existing.next_run_at === null || entry.next_run_at < existing.next_run_at)) {
        existing.next_run_at = entry.next_run_at;
      }
      continue;
    }
    if (byName.size >= maxTasks) {
      truncated = true;
      continue;
    }
    byName.set(entry.name, {
      name: entry.name,
      status: entry.status,
      last_run_at: entry.last_run_at,
      last_result: entry.last_result,
      next_run_at: entry.next_run_at,
      // 근거 없음(코드 미상)은 초록이 아니다.
      healthy: entry.last_result !== null && BENIGN_LAST_RESULTS.has(entry.last_result) && entry.status !== "Disabled",
      trigger_count: 1,
    });
  }

  const tasks = [...byName.values()].sort((a, b) => a.name.localeCompare(b.name, "en"));
  return { tasks, truncated, reason: null };
}

function summarize(tasks) {
  return {
    total: tasks.length,
    running: tasks.filter((task) => task.status === "Running").length,
    disabled: tasks.filter((task) => task.status === "Disabled").length,
    failing: tasks.filter((task) => task.healthy === false).length,
  };
}

export function unavailableScheduledTasksProjection(reason, nowMs = Date.now()) {
  return {
    schema_version: SCHEDULED_TASKS_PROJECTION_SCHEMA,
    state: "unavailable",
    reason,
    observed_at: new Date(nowMs).toISOString(),
    truncated: false,
    summary: { total: 0, running: 0, disabled: 0, failing: 0 },
    tasks: [],
    authority_boundary: { read_only: true, runtime_authority: false, repair_authority: false },
  };
}

// PowerShell 출력도 콘솔 코드페이지를 따를 수 있다(한국어 Windows 에서는
// cp949). UTF-8 을 fatal 로 먼저 시도하고, 실패하면 euc-kr, 그래도 안 되면
// latin1 로 내려간다. 실측(2026-09-06, 이 host): ConvertTo-Json -Compress 의
// 실제 바이트는 BOM 없는 순수 UTF-8 이었다 — 그래도 이 폴백은 값싸고
// 안전하므로 그대로 둔다.
export function decodeConsoleOutput(buffer) {
  for (const encoding of ["utf-8", "euc-kr"]) {
    try {
      return new TextDecoder(encoding, { fatal: true }).decode(buffer);
    } catch {
      // 다음 후보로.
    }
  }
  return buffer.toString("latin1");
}

function toPowerShellSingleQuotedLiteral(value) {
  return `'${String(value).replace(/'/gu, "''")}'`;
}

// schtasks 텍스트를 전혀 읽지 않는다: Get-ScheduledTask 개체에서 이름 붙은
// 속성 다섯 개만 골라 담는다. Actions(명령행·인자)·Principal(계정)·Author·
// TaskPath 는 이 pscustomobject 가 애초에 선택하지 않으므로 뒤 단계로 흘러갈
// 경로 자체가 없다. Where-Object 의 접두사 선별은 트래픽을 줄이는 최적화일
// 뿐이며, 진짜 집행은 projectScheduledTasksJson 의 이름 검사가 다시 한다.
// $ErrorActionPreference='Stop' 은 Get-ScheduledTaskInfo 개별 실패를
// 우리가 직접 잡은 try/catch 로 국한시키고, 그 밖의 예상 못한 오류는(모듈
// 로드 실패 등) 스크립트를 끝까지 실패시켜 0이 아닌 종료 코드로 내보낸다
// (Windows PowerShell 5.1 실측: 처리되지 않은 종료 오류는 이미 0이 아닌
// 종료 코드를 낸다).
function buildScheduledTasksScript(prefixes) {
  const prefixLiteral = prefixes.map(toPowerShellSingleQuotedLiteral).join(",");
  return [
    "$ErrorActionPreference = 'Stop'",
    `$prefixes = @(${prefixLiteral})`,
    "$tasks = Get-ScheduledTask | Where-Object { $n = $_.TaskName; ($prefixes | Where-Object { $n.StartsWith($_) }).Count -gt 0 }",
    "$rows = foreach ($t in $tasks) {",
    "  $i = $null",
    "  try { $i = $t | Get-ScheduledTaskInfo } catch { $i = $null }",
    "  $lr = $i.LastRunTime",
    "  $nr = $i.NextRunTime",
    "  [pscustomobject]@{",
    "    name = $t.TaskName",
    "    state = [string]$t.State",
    "    last_run_at = if ($lr -and $lr.Year -gt 1601) { $lr.ToString('yyyy-MM-dd HH:mm') } else { $null }",
    "    last_result = $i.LastTaskResult",
    "    next_run_at = if ($nr -and $nr.Year -gt 1601) { $nr.ToString('yyyy-MM-dd HH:mm') } else { $null }",
    "  }",
    "}",
    "$rows | ConvertTo-Json -Compress",
  ].join("\n");
}

function runPowerShellScheduledTasksQuery({ prefixes, timeoutMs, spawnImpl }) {
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawnImpl("powershell.exe", [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        buildScheduledTasksScript(prefixes),
      ], {
        windowsHide: true,
        stdio: ["ignore", "pipe", "ignore"],
      });
    } catch {
      reject(new Error("scheduled_tasks_spawn_failed"));
      return;
    }
    const chunks = [];
    let bytes = 0;
    let settled = false;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { child.kill(); } catch { /* 이미 끝난 프로세스 */ }
      if (error) reject(error); else resolve(value);
    };
    const timer = setTimeout(() => finish(new Error("scheduled_tasks_query_timeout")), timeoutMs);
    child.stdout.on("data", (chunk) => {
      bytes += chunk.length;
      if (bytes > MAX_STDOUT_BYTES) {
        finish(new Error("scheduled_tasks_output_oversize"));
        return;
      }
      chunks.push(chunk);
    });
    child.on("error", () => finish(new Error("scheduled_tasks_spawn_failed")));
    child.on("close", (code) => {
      if (code !== 0) {
        finish(new Error("scheduled_tasks_query_failed"));
        return;
      }
      finish(null, decodeConsoleOutput(Buffer.concat(chunks)));
    });
  });
}

export function createScheduledTasksReader({
  platform = process.platform,
  spawnImpl = spawn,
  ttlMs = DEFAULT_SCHEDULED_TASKS_TTL_MS,
  timeoutMs = DEFAULT_SCHEDULED_TASKS_TIMEOUT_MS,
  prefixes = SCHEDULED_TASKS_NAME_PREFIXES,
  maxTasks = SCHEDULED_TASKS_MAX,
  now = Date.now,
} = {}) {
  let cached = null;
  let cachedAt = null;
  let inFlight = null;

  async function compute() {
    if (platform !== "win32") {
      return unavailableScheduledTasksProjection("scheduled_tasks_platform_unsupported", now());
    }
    let jsonText;
    try {
      jsonText = await runPowerShellScheduledTasksQuery({ prefixes, timeoutMs, spawnImpl });
    } catch (error) {
      const reason = typeof error?.message === "string" && /^scheduled_tasks_[a-z_]+$/u.test(error.message)
        ? error.message
        : "scheduled_tasks_query_failed";
      return unavailableScheduledTasksProjection(reason, now());
    }
    const { tasks, truncated, reason } = projectScheduledTasksJson(jsonText, { prefixes, maxTasks });
    if (reason !== null) return unavailableScheduledTasksProjection(reason, now());
    return {
      schema_version: SCHEDULED_TASKS_PROJECTION_SCHEMA,
      state: "ready",
      reason: null,
      observed_at: new Date(now()).toISOString(),
      truncated,
      summary: summarize(tasks),
      tasks,
      authority_boundary: { read_only: true, runtime_authority: false, repair_authority: false },
    };
  }

  return {
    async readSnapshot() {
      const observedNow = now();
      if (cached !== null && cachedAt !== null && observedNow - cachedAt < ttlMs) return cached;
      if (inFlight === null) {
        const operation = compute().then((projection) => {
          cached = projection;
          cachedAt = now();
          return projection;
        }, () => {
          const projection = unavailableScheduledTasksProjection("scheduled_tasks_query_failed", now());
          cached = projection;
          cachedAt = now();
          return projection;
        }).finally(() => {
          if (inFlight === operation) inFlight = null;
        });
        inFlight = operation;
      }
      return inFlight;
    },
  };
}

export function createScheduledTasksAdapterPlugin(options = {}) {
  const reader = createScheduledTasksReader(options);
  const configure = (server) => {
    server.middlewares.use((request, response, next) => {
      let url;
      try {
        url = new URL(request.url || "/", "http://127.0.0.1");
      } catch {
        response.statusCode = 400;
        response.end();
        return;
      }
      if (url.pathname !== SCHEDULED_TASKS_SNAPSHOT_PATH) {
        next();
        return;
      }
      if (request.method !== "GET") {
        response.statusCode = 405;
        response.setHeader("Allow", "GET");
        response.end();
        return;
      }
      if (!isDirectLoopbackRequest(request)) {
        response.statusCode = 403;
        response.end();
        return;
      }
      const respond = (projection) => {
        response.statusCode = 200;
        response.setHeader("Content-Type", "application/json; charset=utf-8");
        response.setHeader("Cache-Control", "no-store");
        response.setHeader("X-Content-Type-Options", "nosniff");
        response.end(JSON.stringify(projection));
      };
      void reader.readSnapshot().then(respond, () => respond(
        unavailableScheduledTasksProjection("scheduled_tasks_query_failed"),
      ));
    });
  };
  return {
    name: "soulforge-scheduled-tasks-adapter",
    configureServer: configure,
    configurePreviewServer: configure,
  };
}

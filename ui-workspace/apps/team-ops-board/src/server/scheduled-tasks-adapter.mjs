// scheduled-tasks-adapter.mjs — Bellows(예약 작업) 목록을 loopback 전용
// GET /scheduled-tasks.snapshot.json 으로 투영하는 Vite dev/preview 플러그인.
//
// 읽기 전용이다. 작업을 만들지도, 지우지도, 실행하지도, 멈추지도 않는다. 유일한
// 바깥 호출은 `schtasks /query /fo csv /v` 한 번이며 60초 TTL 캐시와 단일 비행으로
// 억제한다. Windows가 아니거나 호출이 실패하면 fail-closed `unavailable` 이다.
//
// 무엇이 브라우저까지 가는가 (allowlist):
//   name           작업 이름의 마지막 마디만. 폴더 경로는 버린다.
//   status         닫힌 enum 으로 정규화. 원문 문자열은 버린다.
//   last_run_at    `YYYY-MM-DD HH:MM` 로 정규화. 못 읽으면 null.
//   last_result    정수 결과 코드.
//   next_run_at    같은 정규화.
//   healthy        결과 코드에서 파생한 boolean.
//   trigger_count  같은 이름으로 몇 줄이 나왔는지.
//
// 절대 실리지 않는 것: HostName, Author, Task To Run, Start In, Comment,
// Run As User, Schedule* — 즉 명령행·인자·경로·계정. CSV 의 나머지 열은 헤더
// 색인 단계에서 통째로 버려지므로 뒤 단계로 흘러갈 경로 자체가 없다.
//
// 이름 allowlist: `Soulforge-`, `Buzz`, `Hermes` 로 시작하는 작업만 본다. 이 호스트의
// 다른 예약 작업(사무용 소프트웨어, 드라이버 갱신기 등)은 Vigil 의 관심사가 아니고
// 이름 자체가 사용자 환경을 드러낼 수 있다.

import { spawn } from "node:child_process";
import process from "node:process";

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

// schtasks 의 Status 열은 콘솔 로캘을 따른다. 우리가 실제로 도는 두 로캘만 닫힌
// enum 으로 접고 나머지는 `unknown` 으로 둔다. 건강 판정은 결과 코드가 하므로
// 이 표가 비어도 초록이 잘못 켜지지 않는다.
const STATUS_BY_LOCALE_FORM = Object.freeze({
  ready: "Ready",
  running: "Running",
  disabled: "Disabled",
  queued: "Queued",
  "준비": "Ready",
  "실행 중": "Running",
  "실행중": "Running",
  "사용 안 함": "Disabled",
  "사용안함": "Disabled",
  "대기 중": "Queued",
  "대기중": "Queued",
});

// schtasks 의 헤더 줄도 콘솔 로캘을 따른다. 위치(열 번호)로 읽는 대신 이름표를
// 쓰는 이유는 안전 때문이다: 열이 하나만 밀려도 `실행할 작업`(전체 명령행)이
// 이름 칸으로 들어올 수 있다. 아는 이름표가 다 모이지 않으면 fail-closed 로 닫고
// Bellows 를 회색으로 남긴다.
const COLUMN_BY_HEADER = Object.freeze({
  TaskName: "name",
  Status: "status",
  "Last Run Time": "last_run_at",
  "Last Result": "last_result",
  "Next Run Time": "next_run_at",
  "작업 이름": "name",
  "상태": "status",
  "마지막 실행 시간": "last_run_at",
  "마지막 결과": "last_result",
  "다음 실행 시간": "next_run_at",
});
const REQUIRED_COLUMNS = Object.freeze(["name", "status", "last_run_at", "last_result", "next_run_at"]);

function isLoopbackAddress(remoteAddress) {
  if (!remoteAddress) return false;
  return remoteAddress === "127.0.0.1"
    || remoteAddress === "::1"
    || remoteAddress === "::ffff:127.0.0.1";
}

// RFC4180 최소 파서. 따옴표 안의 쉼표·줄바꿈·"" 이스케이프만 다룬다.
export function parseCsvRows(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === "\"") {
        if (text[index + 1] === "\"") {
          field += "\"";
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === "\"") {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\r") {
      // \r\n 과 \n 을 같게 다룬다.
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

// `2026-09-06 오전 2:00:01` / `2026-09-06 2:00:01 AM` / `N/A` 를 로캘 없는
// `YYYY-MM-DD HH:MM` 으로 접는다. 읽히지 않으면 원문을 흘리지 않고 null 을 낸다.
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
  // 폴더 경로는 버리고 마지막 마디만 남긴다.
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

function normalizeResult(raw) {
  if (typeof raw !== "string") return null;
  const value = Number(raw.trim());
  return Number.isSafeInteger(value) ? value : null;
}

// 합성 CSV 로도 그대로 검증되는 순수 함수. 여기가 allowlist 의 집행 지점이다.
export function projectScheduledTasksCsv(csvText, {
  prefixes = SCHEDULED_TASKS_NAME_PREFIXES,
  maxTasks = SCHEDULED_TASKS_MAX,
} = {}) {
  const rows = parseCsvRows(typeof csvText === "string" ? csvText : "");
  if (rows.length === 0) return { tasks: [], truncated: false, reason: "scheduled_tasks_output_empty" };
  const header = rows[0].map((cell) => cell.trim());
  const columnIndex = {};
  header.forEach((cell, index) => {
    const column = COLUMN_BY_HEADER[cell];
    // 첫 등장만 채택한다. schtasks 는 폴더별로 헤더 줄을 반복해 낼 수 있다.
    if (column !== undefined && columnIndex[column] === undefined) columnIndex[column] = index;
  });
  if (REQUIRED_COLUMNS.some((column) => columnIndex[column] === undefined)) {
    return { tasks: [], truncated: false, reason: "scheduled_tasks_header_unrecognized" };
  }

  const byName = new Map();
  let truncated = false;
  for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];
    if (row.length <= columnIndex.name) continue;
    const cell = (column) => (columnIndex[column] === undefined ? undefined : row[columnIndex[column]]);
    // 반복된 헤더 줄은 이름 정규화에서 자연히 탈락한다.
    const name = normalizeScheduledTaskName(cell("name"), prefixes);
    if (name === null) continue;
    const nextRunAt = normalizeScheduledTaskTime(cell("next_run_at"));
    const existing = byName.get(name);
    if (existing !== undefined) {
      existing.trigger_count += 1;
      // 같은 작업의 여러 트리거 줄 중 가장 이른 다음 실행이 진짜 다음 실행이다.
      if (nextRunAt !== null && (existing.next_run_at === null || nextRunAt < existing.next_run_at)) {
        existing.next_run_at = nextRunAt;
      }
      continue;
    }
    if (byName.size >= maxTasks) {
      truncated = true;
      continue;
    }
    const lastResult = normalizeResult(cell("last_result"));
    const status = normalizeStatus(cell("status"));
    byName.set(name, {
      name,
      status,
      last_run_at: normalizeScheduledTaskTime(cell("last_run_at")),
      last_result: lastResult,
      next_run_at: nextRunAt,
      // 근거 없음(코드 미상)은 초록이 아니다.
      healthy: lastResult !== null && BENIGN_LAST_RESULTS.has(lastResult) && status !== "Disabled",
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

// schtasks 출력은 콘솔 코드페이지를 따른다(한국어 Windows 에서는 cp949). UTF-8 을
// fatal 로 먼저 시도하고, 실패하면 euc-kr, 그래도 안 되면 latin1 로 내려간다.
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

function runSchtasks({ timeoutMs, spawnImpl }) {
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawnImpl("schtasks.exe", ["/query", "/fo", "csv", "/v"], {
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
    let csvText;
    try {
      csvText = await runSchtasks({ timeoutMs, spawnImpl });
    } catch (error) {
      const reason = typeof error?.message === "string" && /^scheduled_tasks_[a-z_]+$/u.test(error.message)
        ? error.message
        : "scheduled_tasks_query_failed";
      return unavailableScheduledTasksProjection(reason, now());
    }
    const { tasks, truncated, reason } = projectScheduledTasksCsv(csvText, { prefixes, maxTasks });
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
      if (!isLoopbackAddress(request.socket?.remoteAddress)) {
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

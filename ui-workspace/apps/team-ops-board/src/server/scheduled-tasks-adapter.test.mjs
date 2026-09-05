import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { Readable } from "node:stream";

import {
  SCHEDULED_TASKS_NAME_PREFIXES,
  SCHEDULED_TASKS_PROJECTION_SCHEMA,
  SCHEDULED_TASKS_SNAPSHOT_PATH,
  createScheduledTasksAdapterPlugin,
  createScheduledTasksReader,
  decodeConsoleOutput,
  normalizeScheduledTaskName,
  normalizeScheduledTaskTime,
  parseCsvRows,
  projectScheduledTasksCsv,
} from "./scheduled-tasks-adapter.mjs";

// path-policy: 나쁜 입력 프로브의 경로는 소스에 리터럴로 두지 않고 이어 붙인다
// (검사기가 소스 바이트를 훑기 때문에 리터럴이면 그 자체가 위반이 된다).
const SEP = String.fromCharCode(92);
const FAKE_COMMAND_LINE = ["C", ":", SEP, "WINDOWS", SEP, "System32", SEP, "wscript.exe /secret-arg"].join("");
const FAKE_TOKEN_COMMAND = ["C", ":", SEP, "WINDOWS", SEP, "System32", SEP, "wscript.exe /token=abc"].join("");

const HEADER = [
  "HostName", "TaskName", "Next Run Time", "Status", "Logon Mode", "Last Run Time",
  "Last Result", "Author", "Task To Run", "Start In", "Comment", "Scheduled Task State",
];

function csv(rows) {
  const quote = (cell) => `"${String(cell).replaceAll("\"", "\"\"")}"`;
  return [HEADER, ...rows].map((row) => row.map(quote).join(",")).join("\r\n");
}

// 합성 행: schtasks /query /fo csv /v 가 내는 열 순서를 그대로 흉내낸다.
function row({
  host = "SYNTHETIC-HOST",
  name,
  next = "N/A",
  status = "Ready",
  last = "N/A",
  result = "0",
  taskToRun = FAKE_COMMAND_LINE,
} = {}) {
  return [host, name, next, status, "Interactive only", last, result, ["SYNTHETIC", SEP, "owner"].join(""), taskToRun, "N/A", "", "Enabled"];
}

test("합성 CSV 를 파싱해 허용 필드만 낸다", () => {
  const text = csv([
    row({ name: "\\Soulforge-HPP-Slack-Batch", next: "2026-09-06 오후 12:00:00", last: "2026-09-06 오전 2:00:01", result: "0" }),
  ]);
  const { tasks, truncated, reason } = projectScheduledTasksCsv(text);
  assert.equal(reason, null);
  assert.equal(truncated, false);
  assert.equal(tasks.length, 1);
  assert.deepEqual(Object.keys(tasks[0]).sort(), [
    "healthy", "last_result", "last_run_at", "name", "next_run_at", "status", "trigger_count",
  ]);
  assert.deepEqual(tasks[0], {
    name: "Soulforge-HPP-Slack-Batch",
    status: "Ready",
    last_run_at: "2026-09-06 02:00",
    last_result: 0,
    next_run_at: "2026-09-06 12:00",
    healthy: true,
    trigger_count: 1,
  });
});

test("명령행·인자·경로·호스트·계정은 어떤 필드로도 새지 않는다", () => {
  const text = csv([row({ name: "\\Soulforge-Leak-Probe", taskToRun: FAKE_TOKEN_COMMAND })]);
  const serialized = JSON.stringify(projectScheduledTasksCsv(text).tasks);
  for (const forbidden of ["WINDOWS", "System32", "wscript", "token=abc", "SYNTHETIC-HOST", "SYNTHETIC", "Interactive"]) {
    assert.equal(serialized.includes(forbidden), false, `${forbidden} 이 투영에 남아 있다`);
  }
});

test("allowlist 접두사 밖의 작업은 통째로 빠진다", () => {
  const text = csv([
    row({ name: "\\Soulforge-Keep" }),
    row({ name: "\\BuzzBackup-Daily" }),
    row({ name: "\\HermesGateways-Ensure" }),
    row({ name: "\\OneDrive Reporting Task-S-1-5-21" }),
    row({ name: "\\MicrosoftEdgeUpdateTaskMachineUA" }),
    row({ name: "\\Adobe Acrobat Update Task" }),
    row({ name: "\\NotSoulforge-Trap" }),
  ]);
  const names = projectScheduledTasksCsv(text).tasks.map((task) => task.name);
  assert.deepEqual(names, ["BuzzBackup-Daily", "HermesGateways-Ensure", "Soulforge-Keep"]);
  assert.deepEqual([...SCHEDULED_TASKS_NAME_PREFIXES], ["Soulforge-", "Buzz", "Hermes"]);
});

test("작업 폴더 경로는 마지막 마디만 남기고 버린다", () => {
  assert.equal(normalizeScheduledTaskName("\\Soulforge-A"), "Soulforge-A");
  assert.equal(normalizeScheduledTaskName("\\Private Folder\\Soulforge-B"), "Soulforge-B");
  assert.equal(normalizeScheduledTaskName("\\Private Folder\\Other"), null);
  assert.equal(normalizeScheduledTaskName("Soulforge-C"), "Soulforge-C");
  assert.equal(normalizeScheduledTaskName("\\Soulforge-\u0007bell"), null, "제어문자는 거절");
  assert.equal(normalizeScheduledTaskName(`\\Soulforge-${"x".repeat(200)}`), null, "길이 초과는 거절");
  assert.equal(normalizeScheduledTaskName(null), null);
});

test("실행 시각은 로캘과 무관한 24시간 표기로 접히고 못 읽으면 원문을 흘리지 않는다", () => {
  assert.equal(normalizeScheduledTaskTime("2026-09-06 오전 2:00:01"), "2026-09-06 02:00");
  assert.equal(normalizeScheduledTaskTime("2026-09-06 오후 12:00:00"), "2026-09-06 12:00");
  assert.equal(normalizeScheduledTaskTime("2026-09-06 오전 12:05:00"), "2026-09-06 00:05");
  assert.equal(normalizeScheduledTaskTime("2026-09-06 오후 3:30:01"), "2026-09-06 15:30");
  assert.equal(normalizeScheduledTaskTime("2026-09-06 3:30:01 PM"), "2026-09-06 15:30");
  assert.equal(normalizeScheduledTaskTime("2026-09-06 23:45:00"), "2026-09-06 23:45");
  assert.equal(normalizeScheduledTaskTime("N/A"), null);
  assert.equal(normalizeScheduledTaskTime("사용자 임의 문자열"), null);
  assert.equal(normalizeScheduledTaskTime("2026-13-40 99:99:99"), null);
});

test("결과 코드 0·267009·267011 만 정상이고 코드 미상은 초록이 아니다", () => {
  const text = csv([
    row({ name: "\\Soulforge-Ok", result: "0" }),
    row({ name: "\\Soulforge-Running", result: "267009", status: "Running" }),
    row({ name: "\\Soulforge-NeverRun", result: "267011" }),
    row({ name: "\\Soulforge-Failed", result: "1" }),
    row({ name: "\\Soulforge-Aborted", result: "-1073741510" }),
    row({ name: "\\Soulforge-Unparsable", result: "not-a-number" }),
    row({ name: "\\Soulforge-Off", result: "0", status: "Disabled" }),
  ]);
  const byName = new Map(projectScheduledTasksCsv(text).tasks.map((task) => [task.name, task]));
  assert.equal(byName.get("Soulforge-Ok").healthy, true);
  assert.equal(byName.get("Soulforge-Running").healthy, true);
  assert.equal(byName.get("Soulforge-NeverRun").healthy, true);
  assert.equal(byName.get("Soulforge-Failed").healthy, false);
  assert.equal(byName.get("Soulforge-Aborted").healthy, false);
  assert.equal(byName.get("Soulforge-Unparsable").healthy, false);
  assert.equal(byName.get("Soulforge-Unparsable").last_result, null);
  assert.equal(byName.get("Soulforge-Off").healthy, false, "꺼진 작업은 결과가 0이어도 정상이 아니다");
});

test("같은 이름의 트리거 여러 줄은 하나로 합치고 가장 이른 다음 실행을 쓴다", () => {
  const text = csv([
    row({ name: "\\Soulforge-HPP-Voice-ASR-Label", next: "2026-09-06 오후 4:30:00" }),
    row({ name: "\\Soulforge-HPP-Voice-ASR-Label", next: "2026-09-06 오전 4:30:00" }),
    row({ name: "\\Soulforge-HPP-Voice-ASR-Label", next: "N/A" }),
  ]);
  const { tasks } = projectScheduledTasksCsv(text);
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].trigger_count, 3);
  assert.equal(tasks[0].next_run_at, "2026-09-06 04:30");
});

test("한국어 Windows 의 상태 표기는 닫힌 enum 으로 접히고 모르는 값은 Unknown 이다", () => {
  const text = csv([
    row({ name: "\\Soulforge-Ko-Ready", status: "준비" }),
    row({ name: "\\Soulforge-Ko-Running", status: "실행 중" }),
    row({ name: "\\Soulforge-Ko-Disabled", status: "사용 안 함" }),
    row({ name: "\\Soulforge-Xx", status: "какой-то" }),
  ]);
  const byName = new Map(projectScheduledTasksCsv(text).tasks.map((task) => [task.name, task.status]));
  assert.equal(byName.get("Soulforge-Ko-Ready"), "Ready");
  assert.equal(byName.get("Soulforge-Ko-Running"), "Running");
  assert.equal(byName.get("Soulforge-Ko-Disabled"), "Disabled");
  assert.equal(byName.get("Soulforge-Xx"), "Unknown");
});

test("작업 수 상한을 넘기면 잘렸다고 밝힌다", () => {
  const rows = Array.from({ length: 5 }, (_, index) => row({ name: `\\Soulforge-${index}` }));
  const { tasks, truncated } = projectScheduledTasksCsv(csv(rows), { maxTasks: 3 });
  assert.equal(tasks.length, 3);
  assert.equal(truncated, true);
});

test("헤더를 알아볼 수 없으면 fail-closed 사유를 낸다", () => {
  assert.equal(projectScheduledTasksCsv("").reason, "scheduled_tasks_output_empty");
  assert.equal(projectScheduledTasksCsv("\"A\",\"B\"\r\n\"1\",\"2\"").reason, "scheduled_tasks_header_unrecognized");
});

test("CSV 파서는 따옴표 안의 쉼표·줄바꿈·이스케이프를 다룬다", () => {
  const rows = parseCsvRows("\"a,b\",\"c\"\"d\"\r\n\"e\nf\",\"g\"");
  assert.deepEqual(rows, [["a,b", "c\"d"], ["e\nf", "g"]]);
});

test("비Windows 에서는 schtasks 를 부르지도 않고 unavailable 로 닫는다", async () => {
  let spawned = 0;
  const reader = createScheduledTasksReader({
    platform: "linux",
    spawnImpl: () => { spawned += 1; throw new Error("must not spawn"); },
  });
  const snapshot = await reader.readSnapshot();
  assert.equal(spawned, 0);
  assert.equal(snapshot.schema_version, SCHEDULED_TASKS_PROJECTION_SCHEMA);
  assert.equal(snapshot.state, "unavailable");
  assert.equal(snapshot.reason, "scheduled_tasks_platform_unsupported");
  assert.deepEqual(snapshot.tasks, []);
  assert.deepEqual(snapshot.authority_boundary, { read_only: true, runtime_authority: false, repair_authority: false });
});

function fakeSpawn({ stdout = "", exitCode = 0, failSpawn = false }) {
  return () => {
    if (failSpawn) throw new Error("spawn failed");
    const child = new EventEmitter();
    child.stdout = Readable.from([Buffer.from(stdout, "utf8")]);
    child.kill = () => {};
    queueMicrotask(() => {
      child.stdout.on("end", () => child.emit("close", exitCode));
      child.stdout.resume();
    });
    return child;
  };
}

test("schtasks 가 0이 아닌 코드로 끝나면 fail-closed 다", async () => {
  const reader = createScheduledTasksReader({ platform: "win32", spawnImpl: fakeSpawn({ exitCode: 1 }) });
  const snapshot = await reader.readSnapshot();
  assert.equal(snapshot.state, "unavailable");
  assert.equal(snapshot.reason, "scheduled_tasks_query_failed");
});

test("spawn 자체가 실패해도 예외 대신 unavailable 이 나온다", async () => {
  const reader = createScheduledTasksReader({ platform: "win32", spawnImpl: fakeSpawn({ failSpawn: true }) });
  const snapshot = await reader.readSnapshot();
  assert.equal(snapshot.state, "unavailable");
  assert.equal(snapshot.reason, "scheduled_tasks_spawn_failed");
});

test("성공 경로는 요약을 계산하고 60초 TTL 안에서는 다시 부르지 않는다", async () => {
  let calls = 0;
  const stdout = csv([
    row({ name: "\\Soulforge-Ok", result: "0" }),
    row({ name: "\\Soulforge-Failed", result: "1" }),
    row({ name: "\\Buzz-Running", result: "267009", status: "Running" }),
  ]);
  let clock = 1_000;
  const reader = createScheduledTasksReader({
    platform: "win32",
    now: () => clock,
    spawnImpl: (...args) => { calls += 1; return fakeSpawn({ stdout })(...args); },
  });
  const first = await reader.readSnapshot();
  assert.equal(first.state, "ready");
  assert.deepEqual(first.summary, { total: 3, running: 1, disabled: 0, failing: 1 });
  clock += 30_000;
  await reader.readSnapshot();
  assert.equal(calls, 1, "TTL 안에서는 캐시를 낸다");
  clock += 40_000;
  await reader.readSnapshot();
  assert.equal(calls, 2, "TTL 을 넘기면 다시 읽는다");
});

test("콘솔 출력 디코더는 UTF-8 을 먼저 보고 cp949 로 내려간다", () => {
  assert.equal(decodeConsoleOutput(Buffer.from("오전 2:00", "utf8")), "오전 2:00");
  // cp949 바이트열은 UTF-8 로는 못 읽힌다 — euc-kr 로 내려가야 한다.
  assert.equal(decodeConsoleOutput(Buffer.from([0xbf, 0xc0, 0xc0, 0xfc])), "오전");
});

test("endpoint 는 loopback GET 만 받는다", async () => {
  const plugin = createScheduledTasksAdapterPlugin({ platform: "linux" });
  assert.equal(plugin.name, "soulforge-scheduled-tasks-adapter");
  const handlers = [];
  plugin.configureServer({ middlewares: { use: (handler) => handlers.push(handler) } });
  const handler = handlers[0];
  const call = ({ method = "GET", url = SCHEDULED_TASKS_SNAPSHOT_PATH, remoteAddress = "127.0.0.1" }) =>
    new Promise((resolve) => {
      const headers = {};
      const response = {
        statusCode: 200,
        setHeader: (key, value) => { headers[key] = value; },
        end: (body) => resolve({ statusCode: response.statusCode, headers, body }),
      };
      handler({ method, url, socket: { remoteAddress } }, response, () => resolve({ statusCode: "next", headers, body: null }));
    });

  assert.equal((await call({ method: "POST" })).statusCode, 405);
  assert.equal((await call({ remoteAddress: "10.0.0.9" })).statusCode, 403);
  assert.equal((await call({ url: "/other.json" })).statusCode, "next");
  const ok = await call({});
  assert.equal(ok.statusCode, 200);
  assert.equal(ok.headers["Cache-Control"], "no-store");
  assert.equal(ok.headers["X-Content-Type-Options"], "nosniff");
  assert.equal(JSON.parse(ok.body).state, "unavailable");
});

test("어댑터에는 작업을 만들거나 지우거나 실행하는 동사가 없다", async () => {
  const source = await import("node:fs").then(({ readFileSync }) =>
    readFileSync(new URL("./scheduled-tasks-adapter.mjs", import.meta.url), "utf8"));
  for (const forbidden of ["/create", "/delete", "/run", "/end", "/change", "/tn", "Register-ScheduledTask", "Start-ScheduledTask"]) {
    assert.equal(source.includes(forbidden), false, `읽기 전용 어댑터에 ${forbidden} 이 있으면 안 된다`);
  }
  assert.equal((source.match(/spawnImpl\("schtasks\.exe", \["\/query", "\/fo", "csv", "\/v"\]/gu) ?? []).length, 1);
});

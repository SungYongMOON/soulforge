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
  projectScheduledTasksJson,
} from "./scheduled-tasks-adapter.mjs";

// path-policy: 나쁜 입력 프로브의 경로는 소스에 리터럴로 두지 않고 이어 붙인다
// (검사기가 소스 바이트를 훑기 때문에 리터럴이면 그 자체가 위반이 된다).
const SEP = String.fromCharCode(92);
const FAKE_COMMAND_LINE = ["C", ":", SEP, "WINDOWS", SEP, "System32", SEP, "wscript.exe /secret-arg"].join("");
const FAKE_TOKEN_COMMAND = ["C", ":", SEP, "WINDOWS", SEP, "System32", SEP, "wscript.exe /token=abc"].join("");

// PowerShell 스크립트가 실제로 내는 행의 모양(다섯 필드)을 그대로 흉내낸다.
// last_result 는 CSV 시절과 달리 JSON 숫자다(문자열이 아니다) — Get-ScheduledTaskInfo
// 의 LastTaskResult 가 애초에 숫자이기 때문이다.
function psRow({
  name,
  state = "Ready",
  lastRunAt = null,
  lastResult = 0,
  nextRunAt = null,
} = {}) {
  return { name, state, last_run_at: lastRunAt, last_result: lastResult, next_run_at: nextRunAt };
}

function psJson(rows) {
  return JSON.stringify(rows);
}

test("합성 JSON 을 파싱해 허용 필드만 낸다", () => {
  const text = psJson([
    psRow({ name: "Soulforge-HPP-Slack-Batch", nextRunAt: "2026-09-06 12:00", lastRunAt: "2026-09-06 02:00", lastResult: 0 }),
  ]);
  const { tasks, truncated, reason } = projectScheduledTasksJson(text);
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

test("PowerShell 이 매치를 하나만 내면 배열이 아니라 개체 하나를 낸다 — 그래도 똑같이 읽는다", () => {
  // Windows PowerShell 5.1 의 실측 동작(-AsArray 가 이 버전에는 없다): ConvertTo-Json
  // 은 입력이 정확히 한 개체일 때 배열로 감싸지 않는다.
  const text = JSON.stringify(psRow({ name: "Soulforge-Solo" }));
  assert.equal(text.startsWith("["), false, "이 픽스처는 배열이 아니라 개체 하나여야 한다");
  const { tasks, reason } = projectScheduledTasksJson(text);
  assert.equal(reason, null);
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].name, "Soulforge-Solo");
});

test("매치가 없으면 PowerShell 은 빈 출력을 내고, 이는 고장이 아니라 0건 ready 다", () => {
  // 실측(2026-09-06, 이 host): allowlist 접두사에 걸리는 작업이 없으면
  // `$rows | ConvertTo-Json -Compress` 는 0바이트를 낸다. 예전 CSV 시절의
  // "빈 출력은 실패"라는 가정을 그대로 옮기면 안 된다 — 이제 빈 출력은
  // "이 host에 우리 작업이 없다"는 정상 신호다.
  const { tasks, truncated, reason } = projectScheduledTasksJson("");
  assert.equal(reason, null);
  assert.equal(truncated, false);
  assert.deepEqual(tasks, []);
});

test("여분 필드가 섞인 행은 조용히 무시하지 않고 투영 전체를 닫는다(명령행 유출 방지)", () => {
  // F1 회귀 확인: 이름·상태·시각·결과 다섯 자리 밖으로 어떤 값도(설령 명령행처럼
  // 생겼어도) 조용히 새 나가지 않는다. 행 하나라도 다섯 키를 벗어나면 부분
  // 목록을 ready 로 내지 않고 전체를 unavailable 로 닫는다.
  const rogue = { ...psRow({ name: "Soulforge-Leak-Probe" }), actions: FAKE_TOKEN_COMMAND };
  const text = JSON.stringify([rogue]);
  const { tasks, reason } = projectScheduledTasksJson(text);
  assert.equal(reason, "scheduled_tasks_output_malformed");
  assert.deepEqual(tasks, []);
  const serialized = JSON.stringify({ tasks, reason });
  for (const forbidden of ["WINDOWS", "System32", "wscript", "token=abc"]) {
    assert.equal(serialized.includes(forbidden), false, `${forbidden} 이 투영에 남아 있다`);
  }
});

test("명령행·인자·경로·계정은 정상 행에서도 애초에 필드로 존재하지 않는다", () => {
  const text = psJson([psRow({ name: "Soulforge-Leak-Probe-2" })]);
  const serialized = JSON.stringify(projectScheduledTasksJson(text).tasks);
  for (const forbidden of ["WINDOWS", "System32", "wscript", FAKE_COMMAND_LINE, "Interactive", "SYNTHETIC-HOST"]) {
    assert.equal(serialized.includes(forbidden), false, `${forbidden} 이 투영에 남아 있다`);
  }
});

test("allowlist 접두사 밖의 작업은 통째로 빠진다(모양은 멀쩡하므로 나머지는 여전히 ready)", () => {
  const text = psJson([
    psRow({ name: "Soulforge-Keep" }),
    psRow({ name: "BuzzBackup-Daily" }),
    psRow({ name: "HermesGateways-Ensure" }),
    psRow({ name: "OneDrive Reporting Task-S-1-5-21" }),
    psRow({ name: "MicrosoftEdgeUpdateTaskMachineUA" }),
    psRow({ name: "Adobe Acrobat Update Task" }),
    psRow({ name: "NotSoulforge-Trap" }),
  ]);
  const { tasks, reason } = projectScheduledTasksJson(text);
  assert.equal(reason, null, "allowlist 밖 이름은 고장이 아니라 정상적인 제외다");
  assert.deepEqual(tasks.map((task) => task.name), ["BuzzBackup-Daily", "HermesGateways-Ensure", "Soulforge-Keep"]);
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
  assert.equal(normalizeScheduledTaskTime("2026-09-06 23:45"), "2026-09-06 23:45", "PowerShell 고정 포맷(초 없음)도 읽는다");
  assert.equal(normalizeScheduledTaskTime("N/A"), null);
  assert.equal(normalizeScheduledTaskTime("사용자 임의 문자열"), null);
  assert.equal(normalizeScheduledTaskTime("2026-13-40 99:99:99"), null);
});

test("결과 코드 0·267009·267011 만 정상이고 코드 미상·정보 없음은 초록이 아니다", () => {
  const text = psJson([
    psRow({ name: "Soulforge-Ok", lastResult: 0 }),
    psRow({ name: "Soulforge-Running", lastResult: 267009, state: "Running" }),
    psRow({ name: "Soulforge-NeverRun", lastResult: 267011 }),
    psRow({ name: "Soulforge-Failed", lastResult: 1 }),
    psRow({ name: "Soulforge-Aborted", lastResult: -1073741510 }),
    psRow({ name: "Soulforge-InfoUnavailable", lastResult: null }),
    psRow({ name: "Soulforge-Off", lastResult: 0, state: "Disabled" }),
  ]);
  const byName = new Map(projectScheduledTasksJson(text).tasks.map((task) => [task.name, task]));
  assert.equal(byName.get("Soulforge-Ok").healthy, true);
  assert.equal(byName.get("Soulforge-Running").healthy, true);
  assert.equal(byName.get("Soulforge-NeverRun").healthy, true);
  assert.equal(byName.get("Soulforge-Failed").healthy, false);
  assert.equal(byName.get("Soulforge-Aborted").healthy, false);
  assert.equal(byName.get("Soulforge-InfoUnavailable").healthy, false);
  assert.equal(byName.get("Soulforge-InfoUnavailable").last_result, null);
  assert.equal(byName.get("Soulforge-Off").healthy, false, "꺼진 작업은 결과가 0이어도 정상이 아니다");
});

test("같은 이름의 항목 여러 개(서로 다른 폴더의 동명 작업)는 하나로 합치고 가장 이른 다음 실행을 쓴다", () => {
  const text = psJson([
    psRow({ name: "Soulforge-HPP-Voice-ASR-Label", nextRunAt: "2026-09-06 16:30" }),
    psRow({ name: "Soulforge-HPP-Voice-ASR-Label", nextRunAt: "2026-09-06 04:30" }),
    psRow({ name: "Soulforge-HPP-Voice-ASR-Label", nextRunAt: null }),
  ]);
  const { tasks } = projectScheduledTasksJson(text);
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].trigger_count, 3);
  assert.equal(tasks[0].next_run_at, "2026-09-06 04:30");
});

test("State enum 의 다섯 값은 그대로 통과하고, 알아볼 수 없는 값은 그 작업만 Unknown 으로 접힌다", () => {
  const text = psJson([
    psRow({ name: "Soulforge-St-Ready", state: "Ready" }),
    psRow({ name: "Soulforge-St-Running", state: "Running" }),
    psRow({ name: "Soulforge-St-Disabled", state: "Disabled" }),
    psRow({ name: "Soulforge-St-Queued", state: "Queued" }),
    psRow({ name: "Soulforge-St-Odd", state: "какой-то" }),
  ]);
  const { tasks, reason } = projectScheduledTasksJson(text);
  assert.equal(reason, null, "state 값이 낯설다고 전체를 닫지는 않는다 — healthy 는 결과 코드가 정한다");
  const byName = new Map(tasks.map((task) => [task.name, task.status]));
  assert.equal(byName.get("Soulforge-St-Ready"), "Ready");
  assert.equal(byName.get("Soulforge-St-Running"), "Running");
  assert.equal(byName.get("Soulforge-St-Disabled"), "Disabled");
  assert.equal(byName.get("Soulforge-St-Queued"), "Queued");
  assert.equal(byName.get("Soulforge-St-Odd"), "Unknown");
});

test("작업 수 상한을 넘기면 잘렸다고 밝힌다", () => {
  const rows = Array.from({ length: 5 }, (_, index) => psRow({ name: `Soulforge-${index}` }));
  const { tasks, truncated } = projectScheduledTasksJson(psJson(rows), { maxTasks: 3 });
  assert.equal(tasks.length, 3);
  assert.equal(truncated, true);
});

test("JSON 파싱에 실패하면 fail-closed 사유를 낸다", () => {
  const { tasks, reason } = projectScheduledTasksJson("{ this is not json");
  assert.equal(reason, "scheduled_tasks_output_malformed");
  assert.deepEqual(tasks, []);
});

test("최상위가 배열도 개체도 아니면 fail-closed 다", () => {
  assert.equal(projectScheduledTasksJson("42").reason, "scheduled_tasks_output_malformed");
  assert.equal(projectScheduledTasksJson("\"just a string\"").reason, "scheduled_tasks_output_malformed");
  assert.equal(projectScheduledTasksJson("true").reason, "scheduled_tasks_output_malformed");
});

test("행에 다섯 키 중 하나라도 없거나 여분이 있으면 fail-closed 다", () => {
  const missing = { name: "Soulforge-Missing", state: "Ready", last_run_at: null, last_result: 0 };
  assert.equal(projectScheduledTasksJson(JSON.stringify([missing])).reason, "scheduled_tasks_output_malformed");
  const extra = { ...psRow({ name: "Soulforge-Extra" }), pid: 12345 };
  assert.equal(projectScheduledTasksJson(JSON.stringify([extra])).reason, "scheduled_tasks_output_malformed");
});

test("필드 타입이 어긋나면(문자열이어야 할 자리에 다른 타입) fail-closed 다 — CSV 시절 문자열 결과 코드로의 회귀 방지", () => {
  const stringResult = { ...psRow({ name: "Soulforge-StringResult" }), last_result: "0" };
  assert.equal(projectScheduledTasksJson(JSON.stringify([stringResult])).reason, "scheduled_tasks_output_malformed");
  const numericName = { ...psRow({ name: "Soulforge-Ok" }), name: 12345 };
  assert.equal(projectScheduledTasksJson(JSON.stringify([numericName])).reason, "scheduled_tasks_output_malformed");
  const arrayRow = [psRow({ name: "Soulforge-Ok" })];
  assert.equal(projectScheduledTasksJson(JSON.stringify([arrayRow])).reason, "scheduled_tasks_output_malformed");
});

test("regression F1: 이름 모양이 어긋난 행이 하나라도 섞이면 나머지가 멀쩡해도 부분 목록을 ready 로 내지 않는다", () => {
  // 예전 CSV 파서는 이름 칸이 밀린 행 하나를 조용히 건너뛰고 나머지를 ready 로
  // 냈다(F1의 근본 원인). 지금은 이름이 NAME_RE 를 통과하지 못하는 행이 있으면
  // — 설령 그 옆에 완전히 정상인 Soulforge-* 작업이 여럿 있어도 — 그 부분
  // 목록을 완결된 답처럼 내지 않고 투영 전체를 닫는다.
  const corruptedName = [SEP, "Soulforge-Corrupted"].join(""); // 경로 구분자가 섞인 비정상 이름
  const text = psJson([
    psRow({ name: "Soulforge-Good-One" }),
    psRow({ name: "Soulforge-Good-Two" }),
    psRow({ name: corruptedName }),
  ]);
  const { tasks, reason } = projectScheduledTasksJson(text);
  assert.equal(reason, "scheduled_tasks_output_malformed");
  assert.deepEqual(tasks, [], "9개 중 2개만 살아남는 식의 부분 ready 목록을 내면 안 된다");
});

test("빈 이름·제어문자가 섞인 이름도 fail-closed 다", () => {
  assert.equal(projectScheduledTasksJson(psJson([psRow({ name: "" })])).reason, "scheduled_tasks_output_malformed");
  assert.equal(projectScheduledTasksJson(psJson([psRow({ name: "Soulforge-\u0007bell" })])).reason, "scheduled_tasks_output_malformed");
});

test("비Windows 에서는 PowerShell 을 부르지도 않고 unavailable 로 닫는다", async () => {
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

test("PowerShell 이 0이 아닌 코드로 끝나면 fail-closed 다", async () => {
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
  const stdout = psJson([
    psRow({ name: "Soulforge-Ok", lastResult: 0 }),
    psRow({ name: "Soulforge-Failed", lastResult: 1 }),
    psRow({ name: "Buzz-Running", lastResult: 267009, state: "Running" }),
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
  const forbiddenVerbs = [
    "/create", "/delete", "/run", "/end", "/change", "/tn",
    "Register-ScheduledTask", "Start-ScheduledTask", "Set-ScheduledTask",
    "Unregister-ScheduledTask", "Stop-ScheduledTask", "Disable-ScheduledTask",
    "Enable-ScheduledTask", "New-ScheduledTask",
  ];
  for (const forbidden of forbiddenVerbs) {
    assert.equal(source.includes(forbidden), false, `읽기 전용 어댑터에 ${forbidden} 이 있으면 안 된다`);
  }
  assert.equal(
    (source.match(/spawnImpl\("powershell\.exe", \[\s*"-NoProfile",\s*"-NonInteractive",\s*"-Command",/gu) ?? []).length,
    1,
    "schtasks.exe 대신 powershell.exe 를 정확히 한 번만 부른다",
  );
  assert.equal(source.includes('spawnImpl("schtasks'), false, "더 이상 schtasks.exe 를 spawn 하지 않는다(설명 주석의 역사적 언급은 허용)");
});

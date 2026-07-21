import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  CONTINUOUS_SUPERVISOR_EVENT_SCHEMA,
  runContinuousSupervisor,
  safeSupervisorErrorCode,
} from "./continuous_supervisor.mjs";

const CLI = fileURLToPath(new URL("./continuous_supervisor_cli.mjs", import.meta.url));
const LAUNCHER = fileURLToPath(new URL("./ops/run-continuous-ingress-supervisor.ps1", import.meta.url));
const REGISTRAR = fileURLToPath(new URL("./ops/register-continuous-ingress-supervisor-task.ps1", import.meta.url));
const DIGEST = `sha256:${"a".repeat(64)}`;

function binding(overrides = {}) {
  return {
    enabled: true,
    schedulerEnabled: true,
    pollIntervalSeconds: 30,
    ...overrides,
  };
}

test("one supervisor process performs repeated one-shot cycles without overlapping launches", async () => {
  const events = [];
  const delays = [];
  const cycles = [];
  const loads = [];
  const result = await runContinuousSupervisor({
    bindingPath: "private-binding.json",
    bindingDigest: DIGEST,
    apply: true,
    maxCycles: 3,
    loadBindingImpl: async (path, options) => {
      loads.push([path, options.bindingDigest]);
      return binding();
    },
    runCycleImpl: async (options) => {
      cycles.push(options);
      return { status: "ok", run_id: `run-${cycles.length}`, errors: [], writes_performed: 0 };
    },
    delayImpl: async (milliseconds) => {
      delays.push(milliseconds);
      return true;
    },
    emit: (event) => events.push(event),
  });

  assert.equal(result.status, "completed");
  assert.equal(result.cycles_completed, 3);
  assert.equal(loads.length, 3);
  assert.deepEqual(delays, [30000, 30000]);
  assert.equal(cycles.length, 3);
  assert.ok(cycles.every((cycle) => cycle.apply === true && cycle.bindingDigest === DIGEST));
  assert.deepEqual(events.map((event) => event.event), [
    "supervisor_started",
    "cycle_completed",
    "cycle_completed",
    "cycle_completed",
    "supervisor_stopped",
  ]);
  assert.ok(events.every((event) => event.schema_version === CONTINUOUS_SUPERVISOR_EVENT_SCHEMA));
});

test("abort stops the persistent loop between cycles", async () => {
  const controller = new AbortController();
  let cycles = 0;
  const result = await runContinuousSupervisor({
    bindingPath: "private-binding.json",
    bindingDigest: DIGEST,
    apply: true,
    signal: controller.signal,
    loadBindingImpl: async () => binding(),
    runCycleImpl: async () => {
      cycles += 1;
      controller.abort();
      return { status: "ok", errors: [], writes_performed: 0 };
    },
  });
  assert.equal(cycles, 1);
  assert.equal(result.status, "stopped");
});

test("fatal cycle errors are sanitized, logged once, and terminate for Windows restart", async () => {
  const events = [];
  const error = new Error("private absolute path must not be emitted");
  await assert.rejects(runContinuousSupervisor({
    bindingPath: "private-binding.json",
    bindingDigest: DIGEST,
    apply: true,
    loadBindingImpl: async () => binding(),
    runCycleImpl: async () => { throw error; },
    emit: (event) => events.push(event),
  }), error);
  assert.equal(events.at(-1).event, "cycle_failed");
  assert.equal(events.at(-1).code, "continuous_supervisor_failed");
  assert.equal(JSON.stringify(events).includes("private absolute path"), false);
  assert.equal(safeSupervisorErrorCode({ code: "writer_authority_expired" }), "writer_authority_expired");
});

test("disabled bindings, disabled scheduler state, and non-apply mode fail closed", async () => {
  await assert.rejects(runContinuousSupervisor({
    bindingPath: "private-binding.json",
    bindingDigest: DIGEST,
    loadBindingImpl: async () => binding(),
  }), { code: "continuous_supervisor_apply_required" });
  for (const value of [binding({ enabled: false }), binding({ schedulerEnabled: false })]) {
    await assert.rejects(runContinuousSupervisor({
      bindingPath: "private-binding.json",
      bindingDigest: DIGEST,
      apply: true,
      loadBindingImpl: async () => value,
      runCycleImpl: async () => assert.fail("cycle must not run"),
    }));
  }
});

test("CLI rejects missing production arguments without leaking values", () => {
  const result = spawnSync(process.execPath, [CLI], { encoding: "utf8" });
  assert.equal(result.status, 2);
  const payload = JSON.parse(result.stderr.trim());
  assert.equal(payload.event, "supervisor_failed");
  assert.equal(payload.code, "continuous_supervisor_apply_required");
});

test("Windows task contract is one hidden at-logon supervisor with a process-lifetime mutex", async (t) => {
  const [launcher, registrar] = await Promise.all([
    readFile(LAUNCHER, "utf8"),
    readFile(REGISTRAR, "utf8"),
  ]);
  assert.match(launcher, /Local\\Soulforge\.HPP\.ContinuousIngress\.Supervisor/);
  assert.match(launcher, /continuous-supervisor\.instance\.lock/);
  assert.match(launcher, /\[IO\.FileShare\]::None/);
  assert.match(launcher, /continuous_supervisor_cli\.mjs/);
  assert.match(launcher, /--apply/);
  assert.match(launcher, /duplicate launch ignored/);
  assert.doesNotMatch(launcher, /throw "continuous supervisor already running"/);
  assert.match(registrar, /New-ScheduledTaskTrigger -AtLogOn/);
  assert.match(registrar, /-WindowStyle", "Hidden"/);
  assert.match(registrar, /-MultipleInstances IgnoreNew/);
  assert.match(registrar, /-RestartCount 3/);
  assert.match(registrar, /-ExecutionTimeLimit \(\[TimeSpan\]::Zero\)/);
  assert.match(registrar, /-AllowStartIfOnBatteries/);
  assert.match(registrar, /-DontStopIfGoingOnBatteries/);
  assert.doesNotMatch(registrar, /RepetitionInterval|New-TimeSpan -Minutes 15/);

  if (process.platform !== "win32") {
    t.skip("PowerShell syntax parser is Windows-only");
    return;
  }
  const command = [
    "$ErrorActionPreference='Stop'",
    `$files=@('${LAUNCHER.replaceAll("'", "''")}','${REGISTRAR.replaceAll("'", "''")}')`,
    "foreach($file in $files){$tokens=$null;$errors=$null;[void][System.Management.Automation.Language.Parser]::ParseFile($file,[ref]$tokens,[ref]$errors);if($errors.Count){$errors|ForEach-Object{[Console]::Error.WriteLine($_.Message)};exit 1}}",
  ].join("; ");
  const parsed = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", command], { encoding: "utf8" });
  assert.equal(parsed.status, 0, parsed.stderr);
});

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  CONTINUOUS_SUPERVISOR_EVENT_SCHEMA,
  CONTINUOUS_SUPERVISOR_HEARTBEAT_SCHEMA,
  createSupervisorHeartbeatRecorder,
  resolveSupervisorHeartbeatLedger,
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
      return {
        status: "ok",
        run_id: `run-${cycles.length}`,
        errors: [],
        writes_performed: 0,
        plaud: {
          status: "ok",
          ready_to_import_count: 4,
          pending_provider_processing_count: 10,
          cutover_ready: false,
        },
      };
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
  assert.equal(events[1].plaud_status, "ok");
  assert.equal(events[1].plaud_ready_to_import_count, 4);
  assert.equal(events[1].plaud_pending_provider_processing_count, 10);
  assert.equal(events[1].plaud_cutover_ready, false);
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

test("completed cycles append one metadata-only heartbeat each to a stable ledger", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "soulforge-supervisor-heartbeat-"));
  const bindingPath = path.join(root, "continuous-binding.json");
  const ledgerPath = resolveSupervisorHeartbeatLedger(bindingPath);
  const recordHeartbeat = createSupervisorHeartbeatRecorder({
    bindingPath,
    instanceId: "test-instance",
    now: () => new Date("2026-08-06T00:00:00.000Z"),
  });

  await runContinuousSupervisor({
    bindingPath,
    bindingDigest: DIGEST,
    apply: true,
    maxCycles: 2,
    loadBindingImpl: async () => binding(),
    runCycleImpl: async () => ({
      status: "degraded",
      run_id: "must-not-enter-heartbeat",
      errors: [
        { binding_id: "mail", code: "auth_failed__acc_hiworks_team" },
        { binding_id: "mail", code: "auth_failed__acc_hiworks_team" },
        { binding_id: "mail", code: "Must-Not-Enter-Heartbeat detail" },
      ],
      writes_performed: 1,
      mail: { status: "partial", private_subject: "must-not-enter-heartbeat" },
    }),
    delayImpl: async () => true,
    recordHeartbeat,
  });

  const lines = (await readFile(ledgerPath, "utf8")).trim().split("\n").map(JSON.parse);
  assert.equal(lines.length, 2);
  assert.deepEqual(lines.map((line) => line.cycle), [1, 2]);
  assert.ok(lines.every((line) => line.schema_version === CONTINUOUS_SUPERVISOR_HEARTBEAT_SCHEMA));
  assert.ok(lines.every((line) => line.observed_at === "2026-08-06T00:00:00.000Z"));
  assert.ok(lines.every((line) => line.instance_id === "test-instance"));
  assert.ok(lines.every((line) => line.mail_status === "partial"));
  assert.ok(lines.every((line) => line.error_count === 3));
  lines.forEach((line) => assert.deepEqual(line.error_codes, ["auth_failed__acc_hiworks_team"]));
  const serialized = JSON.stringify(lines);
  assert.equal(serialized.includes("must-not-enter-heartbeat"), false);
  assert.equal(serialized.includes("Must-Not-Enter-Heartbeat"), false);
  assert.deepEqual(Object.keys(lines[0]), [
    "schema_version",
    "observed_at",
    "instance_id",
    "cycle",
    "status",
    "error_count",
    "error_codes",
    "mail_status",
  ]);
});

test("heartbeat persistence failure terminates the supervisor for bounded OS restart", async () => {
  const failure = new Error("heartbeat disk unavailable");
  await assert.rejects(runContinuousSupervisor({
    bindingPath: "private-binding.json",
    bindingDigest: DIGEST,
    apply: true,
    maxCycles: 1,
    loadBindingImpl: async () => binding(),
    runCycleImpl: async () => ({ status: "ok", errors: [], mail: { status: "ok" } }),
    recordHeartbeat: async () => { throw failure; },
  }), failure);
});

test("conditional writer authority renewal runs before payload and emits only a sanitized success event", async () => {
  const events = [];
  const order = [];
  await runContinuousSupervisor({
    bindingPath: "private-binding.json",
    bindingDigest: DIGEST,
    apply: true,
    maxCycles: 1,
    loadBindingImpl: async () => binding(),
    renewAuthorityImpl: async (options) => {
      order.push("renewal");
      assert.equal(options.bindingDigest, DIGEST);
      return {
        status: "renewed",
        renewed: true,
        epoch: 11,
        expires_at: "2026-09-19T00:00:00.000Z",
      };
    },
    runCycleImpl: async () => {
      order.push("payload");
      return { status: "ok", errors: [], writes_performed: 0 };
    },
    emit: (event) => events.push(event),
  });
  assert.deepEqual(order, ["renewal", "payload"]);
  assert.deepEqual(events.map((event) => event.event), [
    "supervisor_started",
    "writer_authority_renewed",
    "cycle_completed",
    "supervisor_stopped",
  ]);
  assert.deepEqual(events[1], {
    schema_version: CONTINUOUS_SUPERVISOR_EVENT_SCHEMA,
    event: "writer_authority_renewed",
    epoch: 11,
    expires_at: "2026-09-19T00:00:00.000Z",
  });
});

test("renewal failure records a sanitized failure heartbeat and never starts payload work", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "soulforge-supervisor-renewal-failure-"));
  const bindingPath = path.join(root, "continuous-binding.json");
  const ledgerPath = resolveSupervisorHeartbeatLedger(bindingPath);
  let payloadCalls = 0;
  try {
    const error = new Error("private renewal detail");
    error.code = "writer_authority_renewal_policy_expired";
    await assert.rejects(runContinuousSupervisor({
      bindingPath,
      bindingDigest: DIGEST,
      apply: true,
      maxCycles: 1,
      loadBindingImpl: async () => binding(),
      renewAuthorityImpl: async () => { throw error; },
      runCycleImpl: async () => { payloadCalls += 1; return { status: "ok", errors: [] }; },
      recordHeartbeat: createSupervisorHeartbeatRecorder({
        bindingPath,
        instanceId: "renewal-test",
        now: () => new Date("2026-08-20T00:00:00.000Z"),
      }),
    }), error);
    assert.equal(payloadCalls, 0);
    const heartbeat = JSON.parse((await readFile(ledgerPath, "utf8")).trim());
    assert.equal(heartbeat.status, "failed");
    assert.deepEqual(heartbeat.error_codes, ["writer_authority_renewal_policy_expired"]);
    assert.doesNotMatch(JSON.stringify(heartbeat), /private|detail/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
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

test("failed cycles append a sanitized failure heartbeat to the ledger", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "soulforge-supervisor-failed-heartbeat-"));
  const bindingPath = path.join(root, "continuous-binding.json");
  const ledgerPath = resolveSupervisorHeartbeatLedger(bindingPath);
  const recordHeartbeat = createSupervisorHeartbeatRecorder({
    bindingPath,
    instanceId: "test-instance",
    now: () => new Date("2026-08-06T00:00:00.000Z"),
  });

  const failure = new Error("writer_authority_expired");
  failure.code = "writer_authority_expired";

  await assert.rejects(runContinuousSupervisor({
    bindingPath,
    bindingDigest: DIGEST,
    apply: true,
    loadBindingImpl: async () => binding(),
    runCycleImpl: async () => { throw failure; },
    recordHeartbeat,
  }), failure);

  const lines = (await readFile(ledgerPath, "utf8")).trim().split("\n").map(JSON.parse);
  assert.equal(lines.length, 1);
  assert.equal(lines[0].schema_version, CONTINUOUS_SUPERVISOR_HEARTBEAT_SCHEMA);
  assert.equal(lines[0].status, "failed");
  assert.equal(lines[0].error_count, 1);
  assert.deepEqual(lines[0].error_codes, ["writer_authority_expired"]);
  assert.equal(lines[0].mail_status, null);
  assert.equal(lines[0].cycle, 1);
  assert.deepEqual(Object.keys(lines[0]), [
    "schema_version",
    "observed_at",
    "instance_id",
    "cycle",
    "status",
    "error_count",
    "error_codes",
    "mail_status",
  ]);
});

test("load binding failure before cycle 1 records a failure heartbeat with exact safe code", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "continuous-supervisor-startup-test-"));
  const bindingPath = path.join(root, "continuous-binding.json");
  const recordHeartbeat = createSupervisorHeartbeatRecorder({ bindingPath });
  const ledgerPath = resolveSupervisorHeartbeatLedger(bindingPath);
  const events = [];

  const failure = new Error("continuous_plaud_cutover_receipt_invalid");
  failure.code = "continuous_plaud_cutover_receipt_invalid";

  await assert.rejects(runContinuousSupervisor({
    apply: true,
    bindingPath,
    bindingDigest: DIGEST,
    emit: (e) => events.push(e),
    loadBindingImpl: async () => { throw failure; },
    runCycleImpl: async () => assert.fail("cycle must not run"),
    recordHeartbeat,
  }), failure);

  assert.equal(events.some((e) => e.event === "cycle_failed" && e.code === "continuous_plaud_cutover_receipt_invalid"), true);

  const lines = (await readFile(ledgerPath, "utf8")).trim().split("\n").map(JSON.parse);
  assert.equal(lines.length, 1);
  assert.equal(lines[0].schema_version, CONTINUOUS_SUPERVISOR_HEARTBEAT_SCHEMA);
  assert.equal(lines[0].status, "failed");
  assert.equal(lines[0].cycle, 1);
  assert.deepEqual(lines[0].error_codes, ["continuous_plaud_cutover_receipt_invalid"]);

  await rm(root, { recursive: true, force: true });
});

test("startup failure heartbeat for an unsafe error without code records generic path-free code", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "continuous-supervisor-unsafe-error-test-"));
  const bindingPath = path.join(root, "continuous-binding.json");
  const recordHeartbeat = createSupervisorHeartbeatRecorder({ bindingPath });
  const ledgerPath = resolveSupervisorHeartbeatLedger(bindingPath);
  const events = [];

  const unsafeFailure = new Error("Failed to load binding: Unsafe error message with spaces and /secret_path/binding.json");

  await assert.rejects(runContinuousSupervisor({
    apply: true,
    bindingPath,
    bindingDigest: DIGEST,
    emit: (e) => events.push(e),
    loadBindingImpl: async () => { throw unsafeFailure; },
    runCycleImpl: async () => assert.fail("cycle must not run"),
    recordHeartbeat,
  }), unsafeFailure);

  assert.equal(events.some((e) => e.event === "cycle_failed" && e.code === "continuous_supervisor_failed"), true);
  assert.doesNotMatch(JSON.stringify(events), /secret_path/u);

  const lines = (await readFile(ledgerPath, "utf8")).trim().split("\n").map(JSON.parse);
  assert.equal(lines.length, 1);
  assert.equal(lines[0].status, "failed");
  assert.deepEqual(lines[0].error_codes, ["continuous_supervisor_failed"]);
  assert.doesNotMatch(JSON.stringify(lines[0]), /secret_path/u);

  await rm(root, { recursive: true, force: true });
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

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  abortableVoiceLabelDelay,
  runContinuousVoiceLabelSupervisor,
} from "./continuous_label_supervisor.mjs";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const LAUNCHER = path.join(ROOT, "ops", "run-continuous-label-supervisor.ps1");
const REGISTRAR = path.join(ROOT, "ops", "register-continuous-label-supervisor-task.ps1");

test("supervisor runs bounded cycles and emits metadata-only summaries", async () => {
  const events = [];
  let calls = 0;
  const result = await runContinuousVoiceLabelSupervisor({
    apply: true,
    pollSeconds: 60,
    maxCycles: 2,
    delayImpl: async () => true,
    emit: (value) => events.push(value),
    runWorkerImpl: async () => {
      calls += 1;
      return {
        status: "ok",
        run_id: `run-${calls}`,
        asr: { processed_count: 1, failed_count: 0, remaining_pending_count: 2 },
        labels: {
          processed_session_count: 1,
          duplicate_session_count: 0,
          failed_session_count: 0,
          timeline_annotation_count: 3,
        },
      };
    },
  });
  assert.equal(result.status, "completed");
  assert.equal(calls, 2);
  assert.equal(events.filter((value) => value.event === "cycle_completed").length, 2);
  assert.equal(JSON.stringify(events).includes("transcript"), false);
});

test("abortable delay stops immediately for an aborted signal", async () => {
  const controller = new AbortController();
  controller.abort();
  assert.equal(await abortableVoiceLabelDelay(1000, controller.signal), false);
});

test("supervisor records a transient worker failure and continues safely", async () => {
  const events = [];
  let calls = 0;
  let delays = 0;
  const result = await runContinuousVoiceLabelSupervisor({
    apply: true,
    pollSeconds: 60,
    maxCycles: 2,
    delayImpl: async () => {
      delays += 1;
      return true;
    },
    emit: (value) => events.push(value),
    runWorkerImpl: async () => {
      calls += 1;
      if (calls === 1) {
        const error = new Error("must not be emitted");
        error.code = "voice_label_profile_digest_mismatch";
        throw error;
      }
      return { status: "ok", run_id: "recovered" };
    },
  });
  assert.equal(result.status, "completed");
  assert.equal(calls, 2);
  assert.equal(delays, 1);
  const failure = events.find((value) => value.event === "cycle_failed");
  assert.equal(failure.error_code, "voice_label_profile_digest_mismatch");
  assert.equal(failure.retry_required, true);
  assert.equal(events.filter((value) => value.event === "cycle_completed").length, 1);
  assert.equal(JSON.stringify(events).includes("must not be emitted"), false);
});

test("supervisor rejects unsafe cadence and non-apply execution", async () => {
  await assert.rejects(runContinuousVoiceLabelSupervisor({ apply: false }), {
    code: "voice_label_supervisor_apply_required",
  });
  await assert.rejects(runContinuousVoiceLabelSupervisor({
    apply: true,
    pollSeconds: 59,
    maxCycles: 1,
    runWorkerImpl: async () => assert.fail("worker must not run"),
  }), { code: "voice_label_supervisor_poll_seconds_invalid" });
});

test("Windows task contract is one hidden at-logon supervisor with duplicate protection", async (t) => {
  const [launcher, registrar] = await Promise.all([
    readFile(LAUNCHER, "utf8"),
    readFile(REGISTRAR, "utf8"),
  ]);
  assert.match(launcher, /Local\\Soulforge\.HPP\.VoiceLabel\.Supervisor/);
  assert.match(launcher, /supervisor\.instance\.lock/);
  assert.match(launcher, /\[IO\.FileShare\]::None/);
  assert.match(launcher, /continuous_label_supervisor_cli\.mjs/);
  assert.match(launcher, /--apply/);
  assert.match(launcher, /SOULFORGE_VOICE_LABEL_EXPECTED_STATE_ROOT/);
  assert.match(launcher, /SOULFORGE_VOICE_LABEL_EXPECTED_ASR_BIN_ROOT/);
  assert.match(launcher, /SOULFORGE_VOICE_LABEL_EXPECTED_RUNTIME_ROOT/);
  assert.match(launcher, /FileAttributes\]::ReparsePoint/);
  assert.match(launcher, /Assert-DisjointPath/);
  assert.match(launcher, /Assert-SafeStateTree/);
  assert.match(launcher, /Assert-SafeStateChildPath/);
  assert.match(launcher, /Assert-DisjointPath -Left \$RuntimeRoot -Right \$RepoRoot/);
  assert.match(registrar, /New-ScheduledTaskTrigger -AtLogOn/);
  assert.match(registrar, /-WindowStyle", "Hidden"/);
  assert.match(registrar, /-MultipleInstances IgnoreNew/);
  assert.match(registrar, /-RestartCount 3/);
  assert.match(registrar, /-ExecutionTimeLimit \(\[TimeSpan\]::Zero\)/);
  assert.match(registrar, /registration inputs validated/);
  assert.match(registrar, /Assert-DisjointPath -Left \$RuntimeRoot -Right \$RepoRoot/);
  assert.doesNotMatch(registrar, /task audit passed/);
  assert.doesNotMatch(registrar, /RepetitionInterval/);

  if (process.platform !== "win32") {
    t.skip("PowerShell syntax parser is Windows-only");
    return;
  }
  const command = [
    "$ErrorActionPreference='Stop'",
    `$files=@('${LAUNCHER.replaceAll("'", "''")}','${REGISTRAR.replaceAll("'", "''")}')`,
    "foreach($file in $files){$tokens=$null;$errors=$null;[void][System.Management.Automation.Language.Parser]::ParseFile($file,[ref]$tokens,[ref]$errors);if($errors.Count){$errors|ForEach-Object{[Console]::Error.WriteLine($_.Message)};exit 1}}",
  ].join("; ");
  const parsed = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", command], {
    encoding: "utf8",
  });
  assert.equal(parsed.status, 0, parsed.stderr);
});

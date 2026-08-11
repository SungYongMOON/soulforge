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
const HIDDEN_LAUNCHER = path.join(ROOT, "ops", "run-continuous-label-supervisor-hidden.vbs");
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

test("Windows task contract is a hidden at-logon supervisor with a repetition watchdog and duplicate protection", async (t) => {
  const [launcher, hiddenLauncher, registrar] = await Promise.all([
    readFile(LAUNCHER, "utf8"),
    readFile(HIDDEN_LAUNCHER, "utf8"),
    readFile(REGISTRAR, "utf8"),
  ]);
  assert.match(hiddenLauncher, /shell\.Run\(command, 0, True\)/u);
  assert.doesNotMatch(hiddenLauncher, /cmd\.exe|Start-Process/iu);
  assert.match(launcher, /Local\\Soulforge\.HPP\.VoiceLabel\.Supervisor/);
  assert.match(launcher, /supervisor\.instance\.lock/);
  assert.match(launcher, /\[IO\.FileShare\]::None/);
  assert.match(launcher, /continuous_label_supervisor_cli\.mjs/);
  assert.match(launcher, /--apply/);
  assert.match(launcher, /SOULFORGE_VOICE_LABEL_EXPECTED_STATE_ROOT/);
  assert.match(launcher, /SOULFORGE_VOICE_LABEL_EXPECTED_ASR_BIN_ROOT/);
  assert.match(launcher, /SOULFORGE_VOICE_LABEL_EXPECTED_RUNTIME_ROOT/);
  assert.match(launcher, /FileAttributes\]::ReparsePoint/);
  assert.match(launcher, /Test-UnsafePathItemReparse/);
  assert.match(launcher, /0x20000000/);
  assert.match(launcher, /fsutil\.exe/);
  assert.match(launcher, /Assert-DisjointPath/);
  assert.match(launcher, /Assert-SafeStateTree/);
  assert.match(launcher, /Assert-SafeStateChildPath/);
  assert.match(launcher, /Assert-DisjointPath -Left \$RuntimeRoot -Right \$RepoRoot/);
  assert.match(registrar, /New-ScheduledTaskTrigger -AtLogOn/);
  assert.match(registrar, /-WindowStyle", "Hidden"/);
  assert.match(registrar, /System32\\wscript\.exe/);
  assert.match(registrar, /"\/\/B", "\/\/NoLogo", \$HiddenLauncher, \$PowerShellExe/u);
  assert.match(registrar, /run-continuous-label-supervisor-hidden\.vbs/u);
  assert.match(registrar, /-MultipleInstances IgnoreNew/);
  assert.match(registrar, /-RestartCount 3/);
  assert.match(registrar, /-ExecutionTimeLimit \(\[TimeSpan\]::Zero\)/);
  assert.match(registrar, /registration inputs validated/);
  assert.match(registrar, /Test-UnsafePathItemReparse/);
  assert.match(registrar, /Assert-DisjointPath -Left \$RuntimeRoot -Right \$RepoRoot/);
  assert.doesNotMatch(registrar, /task audit passed/);
  assert.match(registrar, /\$WatchdogMinutes = 15/);
  assert.match(registrar, /New-ScheduledTaskTrigger -Once/);
  assert.match(registrar, /-RepetitionInterval \(New-TimeSpan -Minutes \$WatchdogMinutes\)/);
  assert.match(registrar, /Repetition\.StopAtDurationEnd = \$false/);
  assert.doesNotMatch(registrar, /RepetitionDuration/);
  assert.match(registrar, /-Trigger @\(\$LogonTrigger, \$WatchdogTrigger\)/);
  assert.match(registrar, /TimeTrigger/);

  if (process.platform !== "win32") {
    t.skip("PowerShell syntax parser is Windows-only");
    return;
  }
  const command = [
    "$ErrorActionPreference='Stop'",
    `$files=@('${LAUNCHER.replaceAll("'", "''")}','${REGISTRAR.replaceAll("'", "''")}')`,
    "foreach($file in $files){$tokens=$null;$errors=$null;$ast=[System.Management.Automation.Language.Parser]::ParseFile($file,[ref]$tokens,[ref]$errors);if($errors.Count){$errors|ForEach-Object{[Console]::Error.WriteLine($_.Message)};exit 1};$helper=$ast.Find({param($node)$node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq 'Test-UnsafePathItemReparse'},$true);if($null -eq $helper){throw 'reparse helper missing'};Invoke-Expression $helper.Extent.Text;$driveRoot=('C:'+[IO.Path]::DirectorySeparatorChar);$expected=[IO.Path]::GetFullPath((Join-Path $driveRoot 'synthetic-cloud-root'));$outside=[IO.Path]::GetFullPath((Join-Path $driveRoot 'outside'));$cloud=[pscustomobject]@{Attributes=[IO.FileAttributes]::ReparsePoint;FullName=$expected;LinkType='';Target=@();ReparseTag=[Convert]::ToUInt64('9000001A',16)};$cloudNullTarget=[pscustomobject]@{Attributes=[IO.FileAttributes]::ReparsePoint;FullName=$expected;LinkType=$null;Target=$null;ReparseTag=[Convert]::ToUInt64('9000001A',16)};$junction=[pscustomobject]@{Attributes=[IO.FileAttributes]::ReparsePoint;FullName=$expected;LinkType='Junction';Target=@($outside);ReparseTag=[Convert]::ToUInt64('A0000003',16)};$nameSurrogate=[pscustomobject]@{Attributes=[IO.FileAttributes]::ReparsePoint;FullName=$expected;LinkType='';Target=@();ReparseTag=[Convert]::ToUInt64('A0000003',16)};$nonCloud=[pscustomobject]@{Attributes=[IO.FileAttributes]::ReparsePoint;FullName=$expected;LinkType='';Target=@();ReparseTag=[Convert]::ToUInt64('80000017',16)};if(Test-UnsafePathItemReparse -Item $cloud -ExpectedPath $expected){throw 'non-link cloud marker rejected'};if(Test-UnsafePathItemReparse -Item $cloudNullTarget -ExpectedPath $expected){throw 'null-target cloud marker rejected'};if(-not(Test-UnsafePathItemReparse -Item $junction -ExpectedPath $expected)){throw 'junction target allowed'};if(-not(Test-UnsafePathItemReparse -Item $nameSurrogate -ExpectedPath $expected)){throw 'name-surrogate tag allowed'};if(-not(Test-UnsafePathItemReparse -Item $nonCloud -ExpectedPath $expected)){throw 'unknown non-cloud reparse tag allowed'}}",
  ].join("; ");
  const parsed = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", command], {
    encoding: "utf8",
  });
  assert.equal(parsed.status, 0, parsed.stderr);
});

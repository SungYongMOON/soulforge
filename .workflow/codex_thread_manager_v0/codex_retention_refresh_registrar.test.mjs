import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  TASK_NAME,
  MAX_REGISTER_ATTEMPTS,
  buildHiddenLaunchAction,
  computeActionDigest,
  planCodexRetentionRefreshRegistration,
  registerCodexRetentionRefreshTask,
} from "./codex_retention_refresh_registrar.mjs";

const ROOT = dirname(fileURLToPath(import.meta.url));
const REGISTRAR_SCRIPT = join(ROOT, "ops", "register-codex-retention-refresh-task.ps1");
const LAUNCHER_SCRIPT = join(ROOT, "ops", "run-codex-retention-refresh.ps1");
const HIDDEN_LAUNCHER_SCRIPT = join(ROOT, "ops", "run-codex-retention-refresh-hidden.vbs");

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "codex-retention-refresh-"));
  const sourceScriptPath = join(root, "codex_retention_automation_cli.mjs");
  await writeFile(sourceScriptPath, "// synthetic cli\n", "utf8");
  return { root, sourceScriptPath };
}

function baseInput(f, overrides = {}) {
  return {
    sourceScriptPath: f.sourceScriptPath,
    nodePath: join(f.root, "node.exe"),
    powerShellPath: join(f.root, "powershell.exe"),
    wscriptPath: join(f.root, "wscript.exe"),
    hiddenLauncherPath: join(f.root, "run-codex-retention-refresh-hidden.vbs"),
    launcherScriptPath: join(f.root, "run-codex-retention-refresh.ps1"),
    localRoot: f.root,
    activityRoot: join(f.root, "activity"),
    // Explicit "checked, no existing task" observation by default. Tests
    // that exercise an existing-task scenario override this with the exact
    // observed task object.
    existingTask: null,
    ...overrides,
  };
}

test("task identity is fixed and rejects a caller-supplied override", async () => {
  const f = await fixture();
  try {
    const result = await planCodexRetentionRefreshRegistration(baseInput(f, { taskName: "Some-Other-Task" }));
    assert.equal(result.status, "HOLD");
    assert.ok(result.hold_reasons.includes("task_identity_fixed"));

    const defaulted = await planCodexRetentionRefreshRegistration(baseInput(f));
    assert.equal(defaulted.status, "READY");
    assert.equal(defaulted.plan.task_name, TASK_NAME);
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test("built action launches hidden and noninteractive", async () => {
  const f = await fixture();
  try {
    const action = buildHiddenLaunchAction({
      powerShellPath: baseInput(f).powerShellPath,
      wscriptPath: baseInput(f).wscriptPath,
      hiddenLauncherPath: baseInput(f).hiddenLauncherPath,
      launcherScriptPath: baseInput(f).launcherScriptPath,
      launchArgs: ["-LocalRoot", f.root],
    });
    assert.equal(action.hidden, true);
    assert.equal(action.noninteractive, true);
    assert.equal(action.execute, baseInput(f).wscriptPath);
    assert.ok(action.args.includes("//B"));
    assert.ok(action.args.includes("//NoLogo"));
    assert.ok(action.args.includes("-NonInteractive"));
    assert.ok(action.args.includes("-NoProfile"));
    const windowStyleIndex = action.args.indexOf("-WindowStyle");
    assert.notEqual(windowStyleIndex, -1);
    assert.equal(action.args[windowStyleIndex + 1], "Hidden");
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test("expected-existing action digest guard rejects mismatch and accepts an exact match as a no-op", async () => {
  const f = await fixture();
  try {
    const first = await planCodexRetentionRefreshRegistration(baseInput(f));
    assert.equal(first.status, "READY");
    const currentDigest = first.plan.action_digest;

    const mismatched = await planCodexRetentionRefreshRegistration(baseInput(f, {
      existingTask: { taskName: TASK_NAME, actionDigest: "0".repeat(64) },
      expectedExistingActionDigest: "1".repeat(64),
    }));
    assert.equal(mismatched.status, "HOLD");
    assert.ok(mismatched.hold_reasons.includes("expected_existing_digest_mismatch"));

    const noop = await planCodexRetentionRefreshRegistration(baseInput(f, {
      existingTask: { taskName: TASK_NAME, actionDigest: currentDigest },
      expectedExistingActionDigest: currentDigest,
    }));
    assert.equal(noop.status, "NOOP");
    assert.equal(noop.already_registered, true);
    assert.equal(noop.action_digest, currentDigest);
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test("existing-task observation is required and its omission holds instead of allowing a blind registration", async () => {
  const f = await fixture();
  try {
    const { existingTask: _omitted, ...withoutExistingTask } = baseInput(f);
    const held = await planCodexRetentionRefreshRegistration(withoutExistingTask);
    assert.equal(held.status, "HOLD");
    assert.ok(held.hold_reasons.includes("existing_task_observation_required"));

    const provenAbsent = await planCodexRetentionRefreshRegistration(baseInput(f, { existingTask: null }));
    assert.equal(provenAbsent.status, "READY");
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test("registration is idempotent for an unchanged plan and never calls the register adapter twice", async () => {
  const f = await fixture();
  try {
    const first = await planCodexRetentionRefreshRegistration(baseInput(f));
    const digest = first.plan.action_digest;
    let calls = 0;
    const adapters = { register: async () => { calls += 1; } };

    const input = baseInput(f, {
      existingTask: { taskName: TASK_NAME, actionDigest: digest },
      expectedExistingActionDigest: digest,
    });
    const receiptOne = await registerCodexRetentionRefreshTask(input, adapters);
    const receiptTwo = await registerCodexRetentionRefreshTask(input, adapters);
    assert.equal(receiptOne.status, "NOOP");
    assert.equal(receiptTwo.status, "NOOP");
    assert.equal(calls, 0);
    // The NOOP receipt must retain the verified action_digest rather than
    // discarding it, so a caller can still confirm which action is already
    // registered without a further plan call.
    assert.equal(receiptOne.action_digest, digest);
    assert.equal(receiptTwo.action_digest, digest);
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test("a missing or disabled source script holds instead of planning a registration", async () => {
  const f = await fixture();
  try {
    const missing = await planCodexRetentionRefreshRegistration(baseInput(f, {
      sourceScriptPath: join(f.root, "does-not-exist.mjs"),
    }));
    assert.equal(missing.status, "HOLD");
    assert.ok(missing.hold_reasons.includes("source_script_missing_or_disabled"));

    const disabled = await planCodexRetentionRefreshRegistration(baseInput(f, { sourceDisabled: true }));
    assert.equal(disabled.status, "HOLD");
    assert.ok(disabled.hold_reasons.includes("source_disabled"));
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test("registration retries a bounded number of times and returns a failure receipt", async () => {
  const f = await fixture();
  try {
    let calls = 0;
    const alwaysFails = {
      register: async () => {
        calls += 1;
        const error = new Error("register_transport_error");
        error.code = "register_transport_error";
        throw error;
      },
    };
    const failed = await registerCodexRetentionRefreshTask(baseInput(f), alwaysFails);
    assert.equal(failed.status, "FAILED");
    assert.equal(failed.attempts, MAX_REGISTER_ATTEMPTS);
    assert.equal(calls, MAX_REGISTER_ATTEMPTS);
    assert.equal(failed.error, "register_transport_error");

    let secondCalls = 0;
    const succeedsOnSecondTry = {
      register: async () => {
        secondCalls += 1;
        if (secondCalls < 2) {
          const error = new Error("transient");
          error.code = "transient";
          throw error;
        }
      },
    };
    const succeeded = await registerCodexRetentionRefreshTask(baseInput(f), succeedsOnSecondTry);
    assert.equal(succeeded.status, "SUCCESS");
    assert.equal(succeeded.attempts, 2);
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test("the planner has no caller-extensible argument surface", async () => {
  const f = await fixture();
  try {
    // The runtime launcher's parameter set is fixed; any attempt to extend
    // it is rejected outright rather than filtered for destructive tokens.
    const withExtraArgs = await planCodexRetentionRefreshRegistration(baseInput(f, {
      extraArgs: ["--apply"],
    }));
    assert.equal(withExtraArgs.status, "HOLD");
    assert.ok(withExtraArgs.hold_reasons.includes("extra_args_not_supported"));

    const withEmptyExtraArgs = await planCodexRetentionRefreshRegistration(baseInput(f, {
      extraArgs: [],
    }));
    assert.equal(withEmptyExtraArgs.status, "HOLD");
    assert.ok(withEmptyExtraArgs.hold_reasons.includes("extra_args_not_supported"));
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test("no destructive token can reach the built launch action", async () => {
  const f = await fixture();
  try {
    assert.throws(() => buildHiddenLaunchAction({
      powerShellPath: baseInput(f).powerShellPath,
      wscriptPath: baseInput(f).wscriptPath,
      hiddenLauncherPath: baseInput(f).hiddenLauncherPath,
      launcherScriptPath: baseInput(f).launcherScriptPath,
      launchArgs: ["--apply"],
    }), { code: "destructive_switch_forbidden" });

    assert.throws(() => buildHiddenLaunchAction({
      powerShellPath: baseInput(f).powerShellPath,
      wscriptPath: baseInput(f).wscriptPath,
      hiddenLauncherPath: baseInput(f).hiddenLauncherPath,
      launcherScriptPath: baseInput(f).launcherScriptPath,
      launchArgs: ["archive"],
    }), { code: "destructive_switch_forbidden" });
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test("adapter register failures are sanitized to a safe closed code and never echo raw error.message", async () => {
  const f = await fixture();
  try {
    const leaksMessage = {
      register: async () => {
        // No .code, and a message that could carry sensitive/internal detail
        // (path fragments, stack-like text). Must not reach the receipt.
        const syntheticSensitiveDetail = `${"C:"}\\Users\\owner\\secret-path`;
        throw new Error(`${syntheticSensitiveDetail} failed unexpectedly: token=abc123`);
      },
    };
    const failed = await registerCodexRetentionRefreshTask(baseInput(f), leaksMessage);
    assert.equal(failed.status, "FAILED");
    assert.equal(failed.error, "register_failed");
    assert.doesNotMatch(failed.error, /secret-path|token=/u);

    const unsafeCode = {
      register: async () => {
        const error = new Error("bad");
        error.code = "Not A Safe Code!!";
        throw error;
      },
    };
    const failedUnsafeCode = await registerCodexRetentionRefreshTask(baseInput(f), unsafeCode);
    assert.equal(failedUnsafeCode.error, "register_failed");
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test("registration never mutates a real scheduled task without an explicit register adapter", async () => {
  const f = await fixture();
  try {
    await assert.rejects(
      registerCodexRetentionRefreshTask(baseInput(f), {}),
      { code: "register_adapter_required" },
    );
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

function stripPowerShellComments(source) {
  return source
    .split(/\r?\n/u)
    .filter((line) => !/^\s*#/u.test(line))
    .join("\n");
}

// The tests above only exercise the JS planner. The canonical owner-facing
// procedure is the three `ops/` files below; this test reads and parses them
// as source text and never registers, starts, or otherwise executes a real
// Scheduled Task.
test("the public ops/ Windows Scheduled Task procedure pins the reviewed hidden report-only contract", async (t) => {
  const [registrar, launcher, hiddenLauncher] = await Promise.all([
    readFile(REGISTRAR_SCRIPT, "utf8"),
    readFile(LAUNCHER_SCRIPT, "utf8"),
    readFile(HIDDEN_LAUNCHER_SCRIPT, "utf8"),
  ]);
  const registrarCode = stripPowerShellComments(registrar);
  const launcherCode = stripPowerShellComments(launcher);

  // Fixed task identity.
  assert.match(registrar, /\$TaskName -ne "Soulforge-Codex-Retention-Refresh"/u);
  assert.match(registrar, /\[string\]\$TaskName = "Soulforge-Codex-Retention-Refresh"/u);

  // Fixed 6h refresh interval: not a caller-selectable [ValidateRange] param
  // anymore, matching the JS planner's REFRESH_INTERVAL_HOURS constant.
  assert.doesNotMatch(registrar, /ValidateRange/u);
  assert.doesNotMatch(registrar, /\[int\]\$RefreshIntervalHours/u);
  assert.match(registrarCode, /\$RefreshIntervalHours = 6\s*$/mu);

  // Exact root TaskPath used consistently for every task-identity cmdlet.
  assert.match(registrar, /\$TaskPath = "\\"/u);
  for (const cmdletCall of [
    /Get-ScheduledTask -TaskName \$TaskName -TaskPath \$TaskPath/u,
    /Export-ScheduledTask -TaskName \$TaskName -TaskPath \$TaskPath/gu,
    /Register-ScheduledTask -TaskName \$TaskName -TaskPath \$TaskPath/gu,
    /Start-ScheduledTask -TaskName \$TaskName -TaskPath \$TaskPath/u,
    /Unregister-ScheduledTask -TaskName \$TaskName -TaskPath \$TaskPath/u,
  ]) {
    assert.match(registrarCode, cmdletCall);
  }

  // Hidden, noninteractive launch chain: registrar builds the wscript+powershell
  // action, and the hidden VBS launcher runs it with a hidden window and waits.
  assert.match(registrar, /"-WindowStyle",\s*"Hidden"/u);
  assert.match(registrar, /"-NoProfile"/u);
  assert.match(registrar, /System32\\wscript\.exe/u);
  assert.match(registrar, /"\/\/B",\s*"\/\/NoLogo",\s*\$HiddenLauncher,\s*\$PowerShellExe/u);
  assert.match(registrar, /run-codex-retention-refresh-hidden\.vbs/u);
  assert.match(hiddenLauncher, /shell\.Run\(command, 0, True\)/u);
  assert.doesNotMatch(hiddenLauncher, /cmd\.exe|Start-Process/iu);

  // Opt-in Register/Start switches, default off.
  assert.match(registrar, /\[switch\]\$Register/u);
  assert.match(registrar, /\[switch\]\$Start/u);
  assert.match(registrar, /if \(-not \$Register\) \{/u);
  assert.match(registrar, /if \(\$Start -and -not \$Register\) \{/u);

  // Existing-task guard is computed from a stable exported-task XML digest,
  // never a direct %WINDIR%\System32\Tasks file read.
  assert.match(registrar, /\$ExpectedExistingTaskSha256/u);
  assert.match(registrar, /\^\[0-9A-Fa-f\]\{64\}\$/u);
  assert.doesNotMatch(registrarCode, /System32\\Tasks/u);
  assert.doesNotMatch(registrarCode, /Get-FileHash/u);
  assert.match(registrar, /function Get-CodexRetentionTaskExportDigest/u);
  assert.match(registrar, /\$Exported = Export-ScheduledTask -TaskName \$TaskName -TaskPath \$TaskPath -ErrorAction Stop/u);
  assert.match(registrar, /\[Security\.Cryptography\.SHA256\]::Create\(\)/u);
  assert.match(registrar, /\$ExistingDigest -ne \$ExpectedExistingTaskSha256\.ToLowerInvariant\(\)/u);

  // Dry run (-Register omitted) prints the current sanitized digest without
  // ever mutating anything; replacement below still requires the caller to
  // supply the exact matching digest.
  assert.match(registrar, /current_task_sha256=\$ExistingDigest/u);
  assert.match(registrar, /mutation=false/u);

  // The first automatic run is scheduled strictly in the future (never a
  // fixed past epoch); -Start is the only immediate-execution path.
  assert.doesNotMatch(registrarCode, /datetime\]::new\(2026/u);
  assert.match(registrar, /\$FirstRun = \(Get-Date\)\.AddHours\(\$RefreshIntervalHours\)/u);
  assert.match(registrar, /-Once -At \$FirstRun/u);

  // Transactional registration: prior definition captured before replacing,
  // restored verbatim if attestation fails; a fresh create removes only the
  // exact just-created task on attestation failure. Both branches are gated
  // on `-not $RegistrationValid`, and the removal is scoped to this exact
  // TaskName/TaskPath — no other deletion authority is exercised anywhere
  // in this file.
  assert.match(registrar, /\$PriorExportedXml = if \(\$WasReplacing\)/u);
  assert.match(registrar, /if \(-not \$RegistrationValid\) \{/u);
  assert.match(registrar, /Register-ScheduledTask -TaskName \$TaskName -TaskPath \$TaskPath -Xml \$PriorExportedXml -Force -ErrorAction Stop/u);
  assert.match(registrar, /Unregister-ScheduledTask -TaskName \$TaskName -TaskPath \$TaskPath -Confirm:\$false -ErrorAction Stop/u);
  assert.equal((registrarCode.match(/Unregister-ScheduledTask/gu) || []).length, 1,
    "Unregister-ScheduledTask must appear exactly once, in the bounded just-created-task rollback");

  // Post-registration attestation pins trigger enabled state, repetition
  // interval, and duration/stop semantics, not just the interval alone.
  // Windows omits both the Enabled node (default true) and the
  // StopAtDurationEnd node (default false) from exported XML when they hold
  // their default value, so both guards must accept an absent node the same
  // as its explicit default and only reject an explicit non-default value.
  assert.match(registrar, /\(\$null -eq \$EnabledNode -or \$EnabledNode\.InnerText -eq "true"\)/u);
  assert.match(registrar, /\(\$null -eq \$StopAtDurationEndNode -or \$StopAtDurationEndNode\.InnerText -eq "false"\)/u);
  assert.doesNotMatch(registrarCode, /\$null -ne \$StopAtDurationEndNode -and \$StopAtDurationEndNode\.InnerText -eq "false"/u);
  assert.match(registrar, /IsNullOrEmpty\(\$DurationNode\.InnerText\)/u);
  assert.match(registrar, /\(\[datetime\]\$StartBoundaryNode\.InnerText\) -gt \(Get-Date\)/u);

  // IgnoreNew multiple-instance policy and bounded restart.
  assert.match(registrar, /-MultipleInstances IgnoreNew/u);
  assert.match(registrar, /-RestartCount 3/u);

  // Report-only CLI invocation, never a destructive one.
  assert.match(registrar, /codex_retention_automation_cli\.mjs/u);
  assert.match(launcher, /codex_retention_automation_cli|SourceScriptPath/u);
  assert.match(launcher, /--local-root \$LocalRoot --activity-root \$ActivityRoot/u);

  // No archive/delete/remove/prune/volume or credential mutation cmdlet
  // anywhere in the reviewed procedure's executable code (comments are
  // stripped first, since both files legitimately document the destructive
  // token set that the source CLI and the post-registration safety check
  // reject, without ever invoking it). Unregister-ScheduledTask is excluded
  // from this blanket ban — it is separately proven above to appear exactly
  // once, bounded to the exact just-created TaskName/TaskPath inside the
  // attestation-failure rollback, which is the only deletion authority this
  // file exercises.
  const destructiveCmdletPattern = /Remove-Item|Format-Volume|Clear-Disk|Set-Volume|ConvertTo-SecureString|Get-Credential|-Password\b/iu;
  assert.doesNotMatch(registrarCode, destructiveCmdletPattern);
  assert.doesNotMatch(launcherCode, destructiveCmdletPattern);
  assert.doesNotMatch(hiddenLauncher, destructiveCmdletPattern);
  const destructiveFlagPattern = /--apply|--delete|--archive|--remove|--prune|--branch-delete/iu;
  assert.doesNotMatch(launcherCode, destructiveFlagPattern);
  assert.doesNotMatch(hiddenLauncher, destructiveFlagPattern);
  assert.match(
    registrarCode,
    /-notmatch '--apply\|--delete\|--archive\|--remove\|--prune\|--branch-delete'/u,
  );

  // Hidden VBS trailing-backslash quoting: a run of trailing backslashes is
  // doubled before the closing quote so an argument that is nothing but a
  // drive letter and a trailing separator cannot be mis-parsed as escaping
  // the closing quote.
  assert.match(hiddenLauncher, /trailingBackslashes/u);
  assert.match(hiddenLauncher, /String\(trailingBackslashes \* 2, "\\"\)/u);

  if (process.platform !== "win32") {
    t.skip("PowerShell syntax parser is Windows-only");
    return;
  }
  // Static syntax-only parse: never invokes Register-ScheduledTask or any
  // other cmdlet in the files, so no real Scheduled Task is touched.
  const command = [
    "$ErrorActionPreference='Stop'",
    `$files=@('${REGISTRAR_SCRIPT.replaceAll("'", "''")}','${LAUNCHER_SCRIPT.replaceAll("'", "''")}')`,
    "foreach($file in $files){$tokens=$null;$errors=$null;" +
      "$null=[System.Management.Automation.Language.Parser]::ParseFile($file,[ref]$tokens,[ref]$errors);" +
      "if($errors.Count){$errors|ForEach-Object{[Console]::Error.WriteLine($_.Message)};exit 1}}",
  ].join("; ");
  const parsed = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", command], {
    encoding: "utf8",
  });
  assert.equal(parsed.status, 0, parsed.stderr);
});

// Exercises the exact production QuoteArgument function (extracted verbatim
// from the reviewed hidden launcher, never a re-implementation) through
// cscript.exe against synthetic driver code that only echoes its return
// value. shell.Run is never reached, so no process is ever actually
// launched by this test.
test("hidden VBS launcher quoting round-trips trailing backslashes and ordinary arguments", async (t) => {
  if (process.platform !== "win32") {
    t.skip("cscript.exe is Windows-only");
    return;
  }
  const hiddenLauncher = await readFile(HIDDEN_LAUNCHER_SCRIPT, "utf8");
  const match = hiddenLauncher.match(/Function QuoteArgument\(value\)[\s\S]*?End Function/u);
  assert.ok(match, "QuoteArgument function must be present in the hidden launcher");

  const root = await mkdtemp(join(tmpdir(), "codex-retention-vbs-"));
  const driverPath = join(root, "quote-driver.vbs");
  const driver = `${match[0]}\n\nDim i\nFor i = 0 To WScript.Arguments.Count - 1\n  WScript.Echo QuoteArgument(WScript.Arguments.Item(i))\nNext\n`;
  await writeFile(driverPath, driver, "utf8");
  try {
    const drive = `${"C:"}`;
    const sep = "\\";
    const cases = [
      { input: `${drive}${sep}`, expected: `"${drive}${sep}${sep}"` },
      { input: `${drive}${sep}Some${sep}Dir${sep}`, expected: `"${drive}${sep}Some${sep}Dir${sep}${sep}"` },
      {
        input: `${drive}${sep}Program Files${sep}Node${sep}node.exe`,
        expected: `"${drive}${sep}Program Files${sep}Node${sep}node.exe"`,
      },
      { input: "plain", expected: '"plain"' },
    ];
    const result = spawnSync("cscript.exe", ["//nologo", driverPath, ...cases.map((c) => c.input)], {
      encoding: "utf8",
    });
    assert.equal(result.status, 0, result.stderr);
    const lines = result.stdout.split(/\r?\n/u).filter(Boolean);
    assert.equal(lines.length, cases.length);
    cases.forEach((testCase, index) => {
      assert.equal(lines[index], testCase.expected);
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { copyFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(HERE, "..");
const SOURCE_LAUNCHER = path.join(APP, "ops", "run-dev-erp-background.ps1");
const SOURCE_REGISTRAR = path.join(APP, "ops", "register-dev-erp-scheduled-task.ps1");
const WINDOWS_ROOT = process.env.SystemRoot || process.env.WINDIR || path.parse(process.execPath).root;
const POWERSHELL = path.join(
  WINDOWS_ROOT,
  "System32",
  "WindowsPowerShell",
  "v1.0",
  "powershell.exe",
);

function powerShellLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function runPowerShellCommand(command) {
  return new Promise((resolve, reject) => {
    const child = spawn(POWERSHELL, [
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      command,
    ], { windowsHide: true });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("exit", (code) => resolve({ code, stdout, stderr }));
  });
}

async function createFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "dev-erp-scheduled-task-"));
  const app = path.join(root, "ui-workspace", "apps", "dev-erp");
  const ops = path.join(app, "ops");
  await mkdir(ops, { recursive: true });
  const launcher = path.join(ops, "run-dev-erp-background.ps1");
  const registrar = path.join(ops, "register-dev-erp-scheduled-task.ps1");
  await copyFile(SOURCE_LAUNCHER, launcher);
  await copyFile(SOURCE_REGISTRAR, registrar);
  return { root, app, launcher, registrar };
}

function task({
  name = "Legacy dev-ERP",
  enabled = true,
  execute = POWERSHELL,
  args,
  workingDirectory = "",
}) {
  return {
    TaskName: name,
    TaskPath: "\\",
    State: enabled ? "Ready" : "Disabled",
    Settings: { Enabled: enabled },
    Actions: [{ Execute: execute, Arguments: args, WorkingDirectory: workingDirectory }],
  };
}

function inventoryPrelude(inventory) {
  return [
    `$global:TaskInventory = ${powerShellLiteral(JSON.stringify(inventory))} | ConvertFrom-Json`,
    "function global:Get-ScheduledTask { param($ErrorAction); @($global:TaskInventory) }",
  ];
}

function invokeRegistrar(fixture, inventory, rawArguments = "", extra = []) {
  const command = [
    ...inventoryPrelude(inventory),
    ...extra,
    `& ${powerShellLiteral(fixture.registrar)} -RuntimeRoot ${powerShellLiteral(fixture.root)} ${rawArguments}`,
    "if ($null -ne $global:RegistrationCapture) { 'CAPTURE=' + ($global:RegistrationCapture | ConvertTo-Json -Compress -Depth 5) }",
  ].join("; ");
  return runPowerShellCommand(command);
}

function legacyLauncherAction(fixture) {
  return `-NoProfile -ExecutionPolicy Bypass -File "${fixture.launcher}" -SecureCookie`;
}

const REGISTER_MOCKS = [
  "function global:New-ScheduledTaskAction { param($Execute,$Argument,$WorkingDirectory); [pscustomobject]@{ Execute=$Execute; Arguments=$Argument; WorkingDirectory=$WorkingDirectory } }",
  "function global:New-ScheduledTaskTrigger { param([switch]$AtLogOn,$User); [pscustomobject]@{ AtLogOn=[bool]$AtLogOn; User=$User } }",
  "function global:New-ScheduledTaskPrincipal { param($UserId,$LogonType,$RunLevel); [pscustomobject]@{ UserId=$UserId; LogonType=[string]$LogonType; RunLevel=[string]$RunLevel } }",
  "function global:New-ScheduledTaskSettingsSet { param($MultipleInstances,$RestartCount,$RestartInterval,$ExecutionTimeLimit,[switch]$StartWhenAvailable); [pscustomobject]@{ MultipleInstances=[string]$MultipleInstances; RestartCount=$RestartCount; StartWhenAvailable=[bool]$StartWhenAvailable; ExecutionTimeLimit=[string]$ExecutionTimeLimit } }",
  "function global:Register-ScheduledTask { param($TaskName,$Action,$Trigger,$Principal,$Settings,$Description,[switch]$Force,$ErrorAction); $global:RegistrationCapture=[pscustomobject]@{ TaskName=$TaskName; Action=$Action; Trigger=$Trigger; Principal=$Principal; Settings=$Settings; Description=$Description; Force=[bool]$Force } }",
];

test("scheduled-task audit rejects an enabled launcher action targeting the same DB", {
  skip: process.platform !== "win32",
}, async () => {
  const fixture = await createFixture();
  try {
    const result = await invokeRegistrar(fixture, [task({
      args: legacyLauncherAction(fixture),
      workingDirectory: fixture.app,
    })]);
    assert.notEqual(result.code, 0);
    assert.match(result.stdout, /enabled-same-db=1/);
    assert.match(`${result.stdout}\n${result.stderr}`, /Enabled dev-ERP task action conflict/);
    assert.match(`${result.stdout}\n${result.stderr}`, /no task was changed/);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("scheduled-task audit never infers an unresolved enabled backend action is safe", {
  skip: process.platform !== "win32",
}, async () => {
  const fixture = await createFixture();
  try {
    const result = await invokeRegistrar(fixture, [task({
      args: '-Command "node server.mjs --host 127.0.0.1"',
      workingDirectory: fixture.app,
    })]);
    assert.notEqual(result.code, 0);
    assert.match(result.stdout, /unresolved-enabled-backend=1/);
    assert.match(`${result.stdout}\n${result.stderr}`, /no task was changed/);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("scheduled-task audit and WhatIf perform no registration mutation", {
  skip: process.platform !== "win32",
}, async () => {
  const fixture = await createFixture();
  const mutationTrap = [
    "function global:New-ScheduledTaskAction { throw 'MUTATION_SURFACE_CALLED' }",
    "function global:Register-ScheduledTask { throw 'MUTATION_SURFACE_CALLED' }",
  ];
  try {
    const audit = await invokeRegistrar(fixture, [], "", mutationTrap);
    assert.equal(audit.code, 0, audit.stderr);
    assert.match(audit.stdout, /audit passed/);
    assert.doesNotMatch(`${audit.stdout}\n${audit.stderr}`, /MUTATION_SURFACE_CALLED/);

    const whatIf = await invokeRegistrar(
      fixture,
      [],
      "-Register -WhatIf -Confirm:$false",
      mutationTrap,
    );
    assert.equal(whatIf.code, 0, whatIf.stderr);
    assert.match(whatIf.stdout, /registration skipped/);
    assert.doesNotMatch(`${whatIf.stdout}\n${whatIf.stderr}`, /MUTATION_SURFACE_CALLED/);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("existing target overwrite requires its exact disabled same-DB handoff", {
  skip: process.platform !== "win32",
}, async () => {
  const fixture = await createFixture();
  const existing = task({
    name: "Soulforge dev-ERP foreground",
    enabled: false,
    args: legacyLauncherAction(fixture),
    workingDirectory: fixture.app,
  });
  try {
    const result = await invokeRegistrar(
      fixture,
      [existing],
      "-Register -WhatIf -Confirm:$false",
    );
    assert.notEqual(result.code, 0);
    assert.match(`${result.stdout}\n${result.stderr}`, /explicit -HandoffFromTaskId acknowledgement/);
    assert.match(`${result.stdout}\n${result.stderr}`, /no task was changed/);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("explicit disabled handoff registers only a current-user Interactive foreground task", {
  skip: process.platform !== "win32",
}, async () => {
  const fixture = await createFixture();
  const taskName = "Soulforge dev-ERP foreground";
  const taskId = `\\${taskName}`;
  const existing = task({
    name: taskName,
    enabled: false,
    args: legacyLauncherAction(fixture),
    workingDirectory: fixture.app,
  });
  try {
    const result = await invokeRegistrar(
      fixture,
      [existing],
      `-Register -SecureCookie -HandoffFromTaskId ${powerShellLiteral(taskId)} -Confirm:$false`,
      REGISTER_MOCKS,
    );
    assert.equal(result.code, 0, result.stderr);
    assert.match(result.stdout, /logon=current-user mode=foreground credentials=none db=explicit/);
    const captureLine = result.stdout.split(/\r?\n/).find((line) => line.startsWith("CAPTURE="));
    assert.ok(captureLine, result.stdout);
    const capture = JSON.parse(captureLine.slice("CAPTURE=".length));
    assert.equal(capture.TaskName, taskName);
    assert.equal(capture.Force, true);
    assert.equal(capture.Trigger.AtLogOn, true);
    assert.ok(capture.Trigger.User);
    assert.equal(capture.Principal.UserId, capture.Trigger.User);
    assert.equal(capture.Principal.LogonType, "Interactive");
    assert.equal(capture.Principal.RunLevel, "Limited");
    assert.equal(capture.Settings.MultipleInstances, "IgnoreNew");
    assert.equal(capture.Settings.RestartCount, 3);
    assert.equal(capture.Settings.StartWhenAvailable, true);
    assert.match(capture.Action.Arguments, /-Foreground/);
    assert.match(capture.Action.Arguments, /-DatabasePath/);
    assert.match(capture.Action.Arguments, /-SecureCookie/);
    assert.match(capture.Description, /no stored credentials/i);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

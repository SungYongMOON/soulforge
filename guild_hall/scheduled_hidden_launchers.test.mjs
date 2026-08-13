import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

const cases = [
  {
    registrar: "guild_hall/gateway/mail_send/ops/register-hiworks-gmail-forwarder-task.ps1",
    launcher: "guild_hall/gateway/mail_send/ops/run-hiworks-gmail-forwarder-hidden.vbs",
  },
  {
    registrar: "guild_hall/local_activity/ops/register-hpp-local-activity-task.ps1",
    launcher: "guild_hall/local_activity/ops/run-hpp-local-activity-hidden.vbs",
  },
  {
    registrar: "guild_hall/slack_history/ops/register-slack-batch-hpp-task.ps1",
    launcher: "guild_hall/slack_history/ops/run-slack-batch-hidden.vbs",
  },
];

test("periodic interactive tasks use repository-owned hidden launchers", async () => {
  for (const entry of cases) {
    const [registrar, launcher] = await Promise.all([
      readFile(entry.registrar, "utf8"),
      readFile(entry.launcher, "utf8"),
    ]);
    assert.match(registrar, /System32\\wscript\.exe/);
    assert.match(registrar, /\/\/B/);
    assert.match(registrar, /\/\/NoLogo/);
    assert.match(registrar, new RegExp(entry.launcher.split("/").at(-1).replaceAll(".", "\\.")));
    assert.match(launcher, /shell\.Run\(command, 0, True\)/);
  }
});

test("Hiworks scheduler pins the exact deployed forwarder bytes", async () => {
  const [registrar, runner, forwarder] = await Promise.all([
    readFile("guild_hall/gateway/mail_send/ops/register-hiworks-gmail-forwarder-task.ps1", "utf8"),
    readFile("guild_hall/gateway/mail_send/ops/run-hiworks-gmail-forwarder.ps1", "utf8"),
    readFile("guild_hall/gateway/mail_send/hiworks_gmail_forwarder.py"),
  ]);
  const match = runner.match(/\$ExpectedForwarderSha256 = '([0-9a-f]{64})'/u);
  assert.ok(match);
  assert.equal(match[1], createHash("sha256").update(forwarder).digest("hex"));
  assert.match(registrar, /rev-parse --path-format=absolute --git-common-dir/u);
  assert.match(registrar, /-BindingPath/u);
  assert.match(runner, /soulforge\.hiworks_gmail_forwarder\.binding\.v1/u);
  assert.match(runner, /\$ForwarderExitCode\s*=\s*\$LASTEXITCODE/u);
  assert.match(runner, /\$ForwarderExitCode\s*-notin\s*@\(0,\s*2\)/u);
  assert.match(runner, /exit\s+0/u);
  assert.doesNotMatch(runner, /[A-Z]:[\\/]/u);
});

test("local activity scheduler emits an atomic sanitized producer-owned health receipt", async () => {
  const runner = await readFile("guild_hall/local_activity/ops/run-hpp-local-activity.ps1", "utf8");
  assert.match(runner, /soulforge\.hpp_local_activity_health\.v1/);
  assert.match(runner, /attempted_at\s*=\s*\$startedAt/);
  assert.match(runner, /completed_at\s*=\s*\$completedAt/);
  assert.match(runner, /last_success_at\s*=\s*\$LastSuccessAt/);
  assert.match(runner, /activity_changed\s*=\s*\$null/);
  assert.match(runner, /\[System\.IO\.File\]::Replace\(\$temporary, \$healthPath, \$replaceBackup\)/);
  assert.match(runner, /\[System\.IO\.File\]::Move\(\$temporary, \$healthPath\)/);
  const healthRecord = runner.slice(runner.indexOf("$record = [ordered]@{"), runner.indexOf("$directory = Split-Path $healthPath"));
  assert.doesNotMatch(healthRecord, /\boutput\b/i);
  assert.doesNotMatch(runner, /D:[\\/]/i);
});

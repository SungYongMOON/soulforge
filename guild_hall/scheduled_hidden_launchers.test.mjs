import assert from "node:assert/strict";
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

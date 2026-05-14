#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import process from "node:process";

const scriptName = process.argv[2];

if (!scriptName) {
  process.stderr.write("Usage: node guild_hall/validate/run_ui_workspace_command.mjs <npm-script>\n");
  process.exit(2);
}

const npm = npmInvocation(["--prefix", "ui-workspace", "run", scriptName]);
const result = spawnSync(npm.command, npm.args, {
  cwd: process.cwd(),
  env: {
    ...process.env,
    UI_LINT_CANONICAL_ROOT: "..",
  },
  stdio: "inherit",
});

if (result.error) {
  process.stderr.write(`Failed to start npm: ${result.error.message}\n`);
  process.exit(1);
}

process.exit(result.status ?? 1);

function npmInvocation(args) {
  if (process.platform !== "win32") {
    return { command: "npm", args };
  }

  return {
    command: process.env.ComSpec ?? "cmd.exe",
    args: ["/d", "/s", "/c", ["npm", ...args.map(quoteCmdArg)].join(" ")],
  };
}

function quoteCmdArg(value) {
  if (/^[A-Za-z0-9_@%+=:,./\\-]+$/.test(value)) {
    return value;
  }
  return `"${value.replaceAll("\"", "\\\"")}"`;
}

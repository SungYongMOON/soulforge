#!/usr/bin/env node

import process from "node:process";
import { spawnSync } from "node:child_process";

const [scriptName, ...scriptArgs] = process.argv.slice(2);

if (!scriptName) {
  process.stderr.write("Usage: node guild_hall/validate/run_ui_workspace_command.mjs <script> [-- args]\n");
  process.exit(2);
}

const env = {
  ...process.env,
  UI_LINT_CANONICAL_ROOT: process.env.UI_LINT_CANONICAL_ROOT?.trim() || ".."
};

const result = runNpm(["--prefix", "ui-workspace", "run", scriptName, ...scriptArgs], {
  cwd: process.cwd(),
  env,
  stdio: "inherit"
});

if (result.error) {
  process.stderr.write(`Failed to run ui-workspace npm script: ${result.error.message}\n`);
}

process.exit(result.status ?? 1);

function runNpm(args, options) {
  if (process.platform !== "win32") {
    return spawnSync("npm", args, options);
  }

  const command = ["npm.cmd", ...args].map(quoteWindowsCmdArg).join(" ");
  return spawnSync(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", command], options);
}

function quoteWindowsCmdArg(value) {
  if (/[\r\n%!\^&|<>]/.test(value)) {
    throw new Error(`Unsupported Windows command argument: ${value}`);
  }

  if (/^[A-Za-z0-9@_+=:,./\\-]+$/.test(value)) {
    return value;
  }

  return `"${value.replaceAll('"', '""')}"`;
}

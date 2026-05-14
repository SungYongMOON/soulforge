#!/usr/bin/env node

import path from "node:path";
import process from "node:process";
import {
  defaultLaunchAgentsDir,
  defaultRenderedDir,
  installLaunchdFiles,
  renderLaunchdFiles,
  verifyLaunchdInstall,
} from "./launchd.mjs";

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const args = parseArgs(rest);
  const repoRoot = path.resolve(args["local-root"] ?? args["repo-root"] ?? process.cwd());

  if (command === "render") {
    return print(args, renderLaunchdFiles({
      repoRoot,
      outputDir: args["output-dir"] ?? defaultRenderedDir(repoRoot),
      shellPath: args["shell-path"],
    }));
  }

  if (command === "install") {
    return print(args, installLaunchdFiles({
      repoRoot,
      outputDir: args["output-dir"] ?? defaultRenderedDir(repoRoot),
      installDir: args["install-dir"] ?? defaultLaunchAgentsDir(),
      shellPath: args["shell-path"],
    }));
  }

  if (command === "verify") {
    return print(args, verifyLaunchdInstall({
      repoRoot,
      installDir: args["install-dir"] ?? defaultLaunchAgentsDir(),
      shellPath: args["shell-path"],
      checkLaunchctl: args["check-launchctl"] === true,
    }));
  }

  printUsageAndExit();
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      continue;
    }
    const raw = token.slice(2);
    const separatorIndex = raw.indexOf("=");
    const key = separatorIndex === -1 ? raw : raw.slice(0, separatorIndex);
    const inlineValue = separatorIndex === -1 ? undefined : raw.slice(separatorIndex + 1);
    const next = argv[index + 1];
    if (inlineValue !== undefined) {
      args[key] = inlineValue;
      continue;
    }
    if (next && !next.startsWith("--")) {
      args[key] = next;
      index += 1;
      continue;
    }
    args[key] = true;
  }
  return args;
}

function print(args, value) {
  if (args.json) {
    process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
    return;
  }
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function printUsageAndExit() {
  process.stderr.write(
    [
      "Usage:",
      "  node guild_hall/always_on_launchd/cli.mjs render --local-root <root> [--output-dir <dir>] [--json]",
      "  node guild_hall/always_on_launchd/cli.mjs install --local-root <root> [--output-dir <dir>] [--install-dir <dir>] [--json]",
      "  node guild_hall/always_on_launchd/cli.mjs verify --local-root <root> [--install-dir <dir>] [--check-launchctl] [--json]",
    ].join("\n"),
  );
  process.exit(1);
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});

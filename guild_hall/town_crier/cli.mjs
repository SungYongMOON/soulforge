#!/usr/bin/env node

import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { runTownCrier, sendTelegramNow, townCrierStatus } from "./runtime.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const args = parseArgs(rest);

  if (command === "run") {
    const result = await runTownCrier(repoRoot, {
      loop: Boolean(args.loop),
      intervalSec: Number(args["interval-sec"] ?? 60),
      limit: Number(args.limit ?? 0),
    });
    printJson(result);
    return;
  }

  if (command === "status") {
    printJson(await townCrierStatus(repoRoot));
    return;
  }

  if (command === "send") {
    const text = await readMessageText(args);
    const result = await sendTelegramNow(repoRoot, { text, event: "manual_send" });
    printJson(result);
    if (!result.ok) {
      process.exitCode = 1;
    }
    return;
  }

  printUsageAndExit();
}

function parseArgs(argv) {
  const flags = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      continue;
    }

    const key = token.slice(2);
    const next = argv[index + 1];
    if (next === undefined || next.startsWith("--")) {
      flags[key] = true;
      continue;
    }

    flags[key] = next;
    index += 1;
  }

  return flags;
}

function printUsageAndExit() {
  console.error(
    [
      "Usage:",
      "  node guild_hall/town_crier/cli.mjs run [--once] [--loop] [--interval-sec <sec>] [--limit <n>]",
      "  node guild_hall/town_crier/cli.mjs status",
      "  node guild_hall/town_crier/cli.mjs send --text <message>",
    ].join("\n"),
  );
  process.exit(1);
}

async function readMessageText(args) {
  if (typeof args.text === "string" && args.text.trim()) {
    return args.text.trim();
  }

  if (typeof args["text-file"] === "string" && args["text-file"].trim()) {
    const { promises: fs } = await import("node:fs");
    return (await fs.readFile(args["text-file"], "utf8")).trim();
  }

  throw new Error("missing required flag: --text or --text-file");
}

function printJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});

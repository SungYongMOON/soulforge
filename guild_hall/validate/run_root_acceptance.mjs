#!/usr/bin/env node

import process from "node:process";
import { spawnSync } from "node:child_process";

const args = parseArgs(process.argv.slice(2));
const mode = args.mode ?? "validate";

const STEPS_BY_MODE = {
  validate: [
    ["canon", "npm run validate:canon"],
    ["ui", "npm run validate:ui"],
    ["gateway", "npm run validate:gateway"],
  ],
  "done-check": [
    ["canon", "npm run validate:canon"],
    ["ui-acceptance", "npm run ui:done:check"],
    ["gateway", "npm run validate:gateway"],
  ],
};

const steps = STEPS_BY_MODE[mode];

if (!steps) {
  process.stderr.write(`Unsupported mode: ${mode}\n`);
  process.exit(2);
}

for (const [label, command] of steps) {
  process.stdout.write(`== ${label} ==\n`);
  const result = spawnSync(command, {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
    shell: true,
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

process.stdout.write(`PASS root ${mode}\n`);

function parseArgs(argv) {
  const flags = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--mode") {
      flags.mode = argv[index + 1];
      index += 1;
      continue;
    }
    if (token.startsWith("--mode=")) {
      flags.mode = token.slice("--mode=".length);
    }
  }

  return flags;
}

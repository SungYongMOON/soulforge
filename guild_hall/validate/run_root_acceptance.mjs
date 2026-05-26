#!/usr/bin/env node

import process from "node:process";
import { spawnSync } from "node:child_process";

const args = parseArgs(process.argv.slice(2));
const mode = args.mode ?? "validate";

const STEPS_BY_MODE = {
  validate: [
    ["path-policy", "npm run validate:path-policy"],
    ["workmeta-payload", "npm run validate:workmeta-payload"],
    ["role-boundary", "npm run validate:role-boundary"],
    ["canon", "npm run validate:canon"],
    ["ai-output-format", "npm run validate:ai-output-format"],
    ["snapshot", "npm run validate:snapshot"],
    ["activity", "npm run validate:activity"],
    ["knowledge-access", "npm run validate:knowledge-access"],
    ["knowledge-graph", "npm run validate:knowledge-graph"],
    ["rag", "npm run validate:rag"],
    ["codex-bridge", "npm run validate:codex-bridge"],
    ["dev-worker", "npm run validate:dev-worker"],
    ["ui", "npm run validate:ui"],
    ["gateway", "npm run validate:gateway"],
  ],
  "done-check": [
    ["path-policy", "npm run validate:path-policy"],
    ["workmeta-payload", "npm run validate:workmeta-payload"],
    ["role-boundary", "npm run validate:role-boundary"],
    ["canon", "npm run validate:canon"],
    ["ai-output-format", "npm run validate:ai-output-format"],
    ["snapshot", "npm run validate:snapshot"],
    ["activity", "npm run validate:activity"],
    ["knowledge-access", "npm run validate:knowledge-access"],
    ["knowledge-graph", "npm run validate:knowledge-graph"],
    ["rag", "npm run validate:rag"],
    ["codex-bridge", "npm run validate:codex-bridge"],
    ["dev-worker", "npm run validate:dev-worker"],
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

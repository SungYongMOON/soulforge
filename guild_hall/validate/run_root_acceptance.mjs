#!/usr/bin/env node

import process from "node:process";
import { spawnSync } from "node:child_process";

const args = parseArgs(process.argv.slice(2));
const mode = args.mode ?? "validate";

const STEPS_BY_MODE = {
  validate: [
    ["path-policy", "node --test guild_hall/validate/local_absolute_path_policy.test.mjs && npm run validate:path-policy:all"],
    ["workmeta-payload", "npm run validate:workmeta-payload"],
    ["role-boundary", "npm run validate:role-boundary"],
    ["canon", "npm run validate:canon"],
    ["core-loop", "npm run validate:core-loop"],
    ["shared", "npm run validate:shared"],
    ["ai-output-format", "npm run validate:ai-output-format"],
    ["snapshot", "npm run validate:snapshot"],
    ["activity", "npm run validate:activity"],
    ["knowledge-access", "npm run validate:knowledge-access"],
    ["daily-ledger", "npm run validate:daily-ledger"],
    ["voice-capture", "npm run validate:voice-capture"],
    ["knowledge-graph", "npm run validate:knowledge-graph"],
    ["rag", "npm run validate:rag"],
    ["codex-bridge", "npm run validate:codex-bridge"],
    ["dev-worker", "npm run validate:dev-worker"],
    ["private-state-sync", "npm run validate:private-state-sync"],
    ["town-crier", "npm run validate:town-crier"],
    ["assistant-dashboard", "npm run validate:assistant-dashboard"],
    ["ui", "npm run validate:ui"],
    ["dev-erp", "npm --prefix ui-workspace/apps/dev-erp test"],
    ["team-ops-app", "npm run validate:team-ops-app"],
    ["gateway", "npm run validate:gateway"],
  ],
  "done-check": [
    ["path-policy", "node --test guild_hall/validate/local_absolute_path_policy.test.mjs && npm run validate:path-policy:all"],
    ["workmeta-payload", "npm run validate:workmeta-payload"],
    ["role-boundary", "npm run validate:role-boundary"],
    ["canon", "npm run validate:canon"],
    ["core-loop", "npm run validate:core-loop"],
    ["shared", "npm run validate:shared"],
    ["ai-output-format", "npm run validate:ai-output-format"],
    ["snapshot", "npm run validate:snapshot"],
    ["activity", "npm run validate:activity"],
    ["knowledge-access", "npm run validate:knowledge-access"],
    ["daily-ledger", "npm run validate:daily-ledger"],
    ["voice-capture", "npm run validate:voice-capture"],
    ["knowledge-graph", "npm run validate:knowledge-graph"],
    ["rag", "npm run validate:rag"],
    ["codex-bridge", "npm run validate:codex-bridge"],
    ["dev-worker", "npm run validate:dev-worker"],
    ["private-state-sync", "npm run validate:private-state-sync"],
    ["town-crier", "npm run validate:town-crier"],
    ["assistant-dashboard", "npm run validate:assistant-dashboard"],
    ["ui-acceptance", "npm run ui:done:check"],
    ["dev-erp", "npm --prefix ui-workspace/apps/dev-erp test"],
    ["team-ops-app", "npm run validate:team-ops-app"],
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

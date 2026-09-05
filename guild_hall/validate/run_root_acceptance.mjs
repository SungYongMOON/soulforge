#!/usr/bin/env node

import process from "node:process";
import { spawnSync } from "node:child_process";

const args = parseArgs(process.argv.slice(2));
const mode = args.mode ?? "validate";

const STEPS_BY_MODE = {
  validate: [
    ["path-policy", "node --test guild_hall/validate/local_absolute_path_policy.test.mjs && npm run validate:path-policy:all"],
    ["display-terms", "npm run validate:display-terms"],
    ["engineering-engine-no-duplicate-authority", "npm run validate:engineering-engine-no-duplicate-authority"],
    ["engineering-engine-core-domain", "npm run validate:engineering-engine-core-domain"],
    ["quality-readiness", "npm run validate:quality-readiness"],
    ["quality-readiness-deepening", "npm run validate:quality-readiness-deepening"],
    ["database-engineering", "npm run validate:database-engineering"],
    ["material-procurement-readiness", "npm run validate:material-procurement-readiness"],
    ["configuration-change-impact", "npm run validate:configuration-change-impact"],
    ["manufacturing-readiness", "npm run validate:manufacturing-readiness"],
    ["field-failure-corrective-action", "npm run validate:field-failure-corrective-action"],
    ["safety-hazard", "npm run validate:safety-hazard"],
    ["bom-supply-chain-risk", "npm run validate:bom-supply-chain-risk"],
    ["interface-consistency", "npm run validate:interface-consistency"],
    ["pcb-compliance", "npm run validate:pcb-compliance"],
    ["reliability-maintainability", "npm run validate:reliability-maintainability"],
    ["calibration-measurement-validity", "npm run validate:calibration-measurement-validity"],
    ["engine-release", "npm run validate:engine-release"],
    ["workmeta-payload", "npm run validate:workmeta-payload"],
    ["role-boundary", "npm run validate:role-boundary"],
    ["authority-taxonomy", "npm run validate:authority-taxonomy"],
    ["canon", "npm run validate:canon"],
    ["product-composition", "npm run validate:product-composition"],
    ["manual-release", "npm run validate:manual-release"],
    ["manual-projection", "npm run validate:manual-projection"],
    ["internal-rc-prephysical", "npm run validate:internal-rc-prephysical"],
    ["main-node-deployment", "npm run validate:main-node-deployment"],
    ["universal-client", "npm run validate:universal-client"],
    ["core-loop", "npm run validate:core-loop"],
    ["shared", "npm run validate:shared"],
    ["project-history-readiness", "npm run validate:project-history-readiness"],
    ["ingress-staging", "npm run validate:ingress-staging"],
    ["ingress-continuous", "npm run validate:ingress-continuous"],
    ["ingress-recovery", "npm run validate:ingress-recovery"],
    ["ingress-authority", "npm run validate:ingress-authority"],
    ["project-history-receipt-adapter-v2", "npm run validate:project-history-receipt-adapter-v2"],
    ["ai-output-format", "npm run validate:ai-output-format"],
    ["snapshot", "npm run validate:snapshot"],
    ["dev-erp-snapshot-contract", "npm run validate:dev-erp-snapshot-contract"],
    ["activity", "npm run validate:activity"],
    ["knowledge-access", "npm run validate:knowledge-access"],
    ["daily-ledger", "npm run validate:daily-ledger"],
    ["file-activity", "npm run validate:file-activity"],
    ["backup-controller", "npm run validate:backup-controller"],
    ["backup-topology-v2", "npm run validate:backup-topology-v2"],
    ["synthetic-recovery-canary", "npm run validate:synthetic-recovery-canary"],
    ["battle-log", "npm run validate:battle-log"],
    ["agent-observation", "npm run validate:agent-observation"],
    ["ai-usage-meter", "npm run validate:ai-usage-meter"],
    ["voice-capture", "npm run validate:voice-capture"],
    ["knowledge-graph", "npm run validate:knowledge-graph"],
    ["rag", "npm run validate:rag"],
    ["codex-bridge", "npm run validate:codex-bridge"],
    ["codex-work-directory", "npm run validate:codex-work-directory"],
    ["dev-worker", "npm run validate:dev-worker"],
    ["private-state-sync", "npm run validate:private-state-sync"],
    ["town-crier", "npm run validate:town-crier"],
    ["assistant-dashboard", "npm run validate:assistant-dashboard"],
    ["engineering-engine-ax-se-project-assessment", "npm run validate:engineering-engine-ax-se-project-assessment"],
    ["engineering-engine-p5-context-generation-candidate", "npm run validate:engineering-engine-p5-context-generation-candidate"],
    ["voice-first-accepted-context", "npm run validate:voice-first-accepted-context"],
    ["voice-first-worker-runtime", "npm run validate:voice-first-worker-runtime"],
    ["voice-first-mutation-canary", "npm run validate:voice-first-mutation-canary"],
    ["watchtower", "npm run validate:watchtower"],
    ["ui", "npm run validate:ui"],
    ["dev-erp", "npm --prefix ui-workspace/apps/dev-erp test"],
    ["dev-erp-mcp", "npm run validate:dev-erp-mcp"],
    ["team-ops-app", "npm run validate:team-ops-app"],
    ["gateway", "npm run validate:gateway"],
  ],
  "done-check": [
    ["path-policy", "node --test guild_hall/validate/local_absolute_path_policy.test.mjs && npm run validate:path-policy:all"],
    ["display-terms", "npm run validate:display-terms"],
    ["engineering-engine-no-duplicate-authority", "npm run validate:engineering-engine-no-duplicate-authority"],
    ["engineering-engine-core-domain", "npm run validate:engineering-engine-core-domain"],
    ["quality-readiness", "npm run validate:quality-readiness"],
    ["quality-readiness-deepening", "npm run validate:quality-readiness-deepening"],
    ["database-engineering", "npm run validate:database-engineering"],
    ["material-procurement-readiness", "npm run validate:material-procurement-readiness"],
    ["configuration-change-impact", "npm run validate:configuration-change-impact"],
    ["manufacturing-readiness", "npm run validate:manufacturing-readiness"],
    ["field-failure-corrective-action", "npm run validate:field-failure-corrective-action"],
    ["safety-hazard", "npm run validate:safety-hazard"],
    ["bom-supply-chain-risk", "npm run validate:bom-supply-chain-risk"],
    ["interface-consistency", "npm run validate:interface-consistency"],
    ["pcb-compliance", "npm run validate:pcb-compliance"],
    ["reliability-maintainability", "npm run validate:reliability-maintainability"],
    ["calibration-measurement-validity", "npm run validate:calibration-measurement-validity"],
    ["engine-release", "npm run validate:engine-release"],
    ["workmeta-payload", "npm run validate:workmeta-payload"],
    ["role-boundary", "npm run validate:role-boundary"],
    ["authority-taxonomy", "npm run validate:authority-taxonomy"],
    ["canon", "npm run validate:canon"],
    ["product-composition", "npm run validate:product-composition"],
    ["manual-release", "npm run validate:manual-release"],
    ["manual-projection", "npm run validate:manual-projection"],
    ["internal-rc-prephysical", "npm run validate:internal-rc-prephysical"],
    ["main-node-deployment", "npm run validate:main-node-deployment"],
    ["universal-client", "npm run validate:universal-client"],
    ["core-loop", "npm run validate:core-loop"],
    ["shared", "npm run validate:shared"],
    ["project-history-readiness", "npm run validate:project-history-readiness"],
    ["ingress-staging", "npm run validate:ingress-staging"],
    ["ingress-continuous", "npm run validate:ingress-continuous"],
    ["ingress-recovery", "npm run validate:ingress-recovery"],
    ["ingress-authority", "npm run validate:ingress-authority"],
    ["project-history-receipt-adapter-v2", "npm run validate:project-history-receipt-adapter-v2"],
    ["ai-output-format", "npm run validate:ai-output-format"],
    ["snapshot", "npm run validate:snapshot"],
    ["dev-erp-snapshot-contract", "npm run validate:dev-erp-snapshot-contract"],
    ["activity", "npm run validate:activity"],
    ["knowledge-access", "npm run validate:knowledge-access"],
    ["daily-ledger", "npm run validate:daily-ledger"],
    ["file-activity", "npm run validate:file-activity"],
    ["backup-controller", "npm run validate:backup-controller"],
    ["backup-topology-v2", "npm run validate:backup-topology-v2"],
    ["synthetic-recovery-canary", "npm run validate:synthetic-recovery-canary"],
    ["battle-log", "npm run validate:battle-log"],
    ["agent-observation", "npm run validate:agent-observation"],
    ["ai-usage-meter", "npm run validate:ai-usage-meter"],
    ["voice-capture", "npm run validate:voice-capture"],
    ["knowledge-graph", "npm run validate:knowledge-graph"],
    ["rag", "npm run validate:rag"],
    ["codex-bridge", "npm run validate:codex-bridge"],
    ["codex-work-directory", "npm run validate:codex-work-directory"],
    ["dev-worker", "npm run validate:dev-worker"],
    ["private-state-sync", "npm run validate:private-state-sync"],
    ["town-crier", "npm run validate:town-crier"],
    ["assistant-dashboard", "npm run validate:assistant-dashboard"],
    ["engineering-engine-ax-se-project-assessment", "npm run validate:engineering-engine-ax-se-project-assessment"],
    ["engineering-engine-p5-context-generation-candidate", "npm run validate:engineering-engine-p5-context-generation-candidate"],
    ["voice-first-accepted-context", "npm run validate:voice-first-accepted-context"],
    ["voice-first-worker-runtime", "npm run validate:voice-first-worker-runtime"],
    ["voice-first-mutation-canary", "npm run validate:voice-first-mutation-canary"],
    ["watchtower", "npm run validate:watchtower"],
    ["ui-acceptance", "npm run ui:done:check"],
    ["dev-erp", "npm --prefix ui-workspace/apps/dev-erp test"],
    ["dev-erp-mcp", "npm run validate:dev-erp-mcp"],
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

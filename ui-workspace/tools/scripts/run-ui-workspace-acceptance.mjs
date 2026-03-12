import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(scriptDir, "../..");

const STEPS = [
  ["validate", "npm run validate"],
  ["lint", "npm run lint:all"],
  ["docs", "npm run docs:check-links"],
  ["build", "npm run build"],
  ["theme-pack", "npm run smoke:theme-pack"]
];

for (const [label, command] of STEPS) {
  console.log(`== ${label} ==`);
  const result = spawnSync(command, {
    cwd: workspaceRoot,
    stdio: "inherit",
    shell: true,
    env: process.env
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

console.log("PASS ui-workspace acceptance check");

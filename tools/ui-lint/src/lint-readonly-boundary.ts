import { findLineMatches, type LintResult } from "./shared";

const CODE_FILES = [
  "apps/renderer-web/vite.config.ts",
  "apps/renderer-web/src/App.tsx",
  "apps/renderer-web/src/main.tsx",
  "packages/renderer-core/src/constants.ts",
  "packages/renderer-core/src/fixtures.ts",
  "packages/renderer-core/src/index.ts",
  "packages/renderer-core/src/legacy-adapter.ts",
  "packages/renderer-core/src/loaders.ts",
  "packages/renderer-core/src/normalize.ts",
  "packages/renderer-core/src/selection.ts",
  "packages/renderer-core/src/types.ts",
  "packages/renderer-core/src/view-model.ts"
];

const CANONICAL_PATTERN = /(?:\.agent\/|\.agent_class\/|_workspaces\/)/;
const DIRECT_READ_PATTERN = /\b(import|from|readFile|readFileSync|fs\.|spawn|spawnSync|exec|fetch)\b/;

function isAllowedReference(file: string, line: string) {
  return file === "apps/renderer-web/vite.config.ts" && line.includes(".agent_class/tools/local_cli/ui_sync/ui_sync.py");
}

export function runReadOnlyBoundaryLint() {
  const issues = [];

  for (const file of CODE_FILES) {
    for (const match of findLineMatches(file, CANONICAL_PATTERN)) {
      if (!DIRECT_READ_PATTERN.test(match.line)) {
        continue;
      }

      if (isAllowedReference(file, match.line)) {
        continue;
      }

      issues.push({
        rule: "canonical-read",
        file,
        message: `line ${match.lineNumber} references canonical tree directly: ${match.line.trim()}`
      });
    }
  }

  return {
    name: "read-only boundary lint",
    issues
  } satisfies LintResult;
}

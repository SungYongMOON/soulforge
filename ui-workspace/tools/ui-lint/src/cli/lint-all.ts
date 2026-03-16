import { printResult } from "../shared";
import { runCatalogLint } from "../lint-catalog";
import { runFixtureCoverageLint } from "../lint-fixture-coverage";
import { runPackageBoundaryLint } from "../lint-package-boundary";
import { runReadOnlyBoundaryLint } from "../lint-readonly-boundary";
import { runThemeIsolationLint } from "../lint-theme-isolation";
import { runUiStateLint } from "../lint-ui-state";
import { runWorkspaceTrackingLint } from "../lint-workspace-tracking";

const results = [
  runCatalogLint(),
  runUiStateLint(),
  runReadOnlyBoundaryLint(),
  runPackageBoundaryLint(),
  runFixtureCoverageLint(),
  runThemeIsolationLint(),
  runWorkspaceTrackingLint()
];

let failures = 0;
for (const result of results) {
  printResult(result);
  if (result.issues.length > 0) {
    failures += 1;
  }
}

if (failures === 0) {
  console.log("PASS ui lint all");
} else {
  process.exitCode = 1;
}

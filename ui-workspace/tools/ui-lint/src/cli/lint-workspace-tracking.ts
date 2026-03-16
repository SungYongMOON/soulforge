import { printResult } from "../shared";
import { runWorkspaceTrackingLint } from "../lint-workspace-tracking";

const result = runWorkspaceTrackingLint();
printResult(result);
if (result.issues.length > 0) {
  process.exitCode = 1;
}

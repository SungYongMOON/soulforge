import { printResult } from "../shared";
import { runPackageBoundaryLint } from "../lint-package-boundary";

const result = runPackageBoundaryLint();
printResult(result);
if (result.issues.length > 0) {
  process.exitCode = 1;
}

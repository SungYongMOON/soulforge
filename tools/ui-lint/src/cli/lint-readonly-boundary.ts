import { printResult } from "../shared";
import { runReadOnlyBoundaryLint } from "../lint-readonly-boundary";

const result = runReadOnlyBoundaryLint();
printResult(result);
if (result.issues.length > 0) {
  process.exitCode = 1;
}

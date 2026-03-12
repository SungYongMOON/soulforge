import { printResult } from "../shared";
import { runUiStateLint } from "../lint-ui-state";

const result = runUiStateLint();
printResult(result);
if (result.issues.length > 0) {
  process.exitCode = 1;
}

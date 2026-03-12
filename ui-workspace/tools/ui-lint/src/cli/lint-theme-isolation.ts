import { printResult } from "../shared";
import { runThemeIsolationLint } from "../lint-theme-isolation";

const result = runThemeIsolationLint();
printResult(result);
if (result.issues.length > 0) {
  process.exitCode = 1;
}

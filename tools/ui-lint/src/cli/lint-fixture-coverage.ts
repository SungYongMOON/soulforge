import { printResult } from "../shared";
import { runFixtureCoverageLint } from "../lint-fixture-coverage";

const result = runFixtureCoverageLint();
printResult(result);
if (result.issues.length > 0) {
  process.exitCode = 1;
}

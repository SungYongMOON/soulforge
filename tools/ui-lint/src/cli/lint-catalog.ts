import { printResult } from "../shared";
import { runCatalogLint } from "../lint-catalog";

const result = runCatalogLint();
printResult(result);
if (result.issues.length > 0) {
  process.exitCode = 1;
}

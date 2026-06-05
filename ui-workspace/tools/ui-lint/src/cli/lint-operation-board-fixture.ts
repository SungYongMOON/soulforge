import { runOperationBoardFixtureLint } from "../lint-operation-board-fixture";
import { printResult } from "../shared";

const result = runOperationBoardFixtureLint();
printResult(result);
if (result.issues.length > 0) {
  process.exitCode = 1;
}

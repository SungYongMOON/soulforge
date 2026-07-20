import { parentPort, workerData } from "node:worker_threads";

import { backupRuntimeDb, restoreTestRuntimeDb } from "../../ui-workspace/apps/dev-erp/tools/runtime_ops.mjs";

let result;
if (workerData.operation === "backup_db") {
  result = backupRuntimeDb({ ...workerData.options, now: new Date(workerData.options.now) });
} else if (workerData.operation === "restore_test") {
  result = restoreTestRuntimeDb(workerData.options);
} else {
  throw new Error("runtime_worker_operation_invalid");
}
parentPort.postMessage(result);

import path from "node:path";
import { fileURLToPath } from "node:url";

import { resolveActivation } from "./activation.mjs";
import { BackupControllerError, dailyCycleController } from "./controller.mjs";
import { createFixedExecutorCatalog } from "./executors.mjs";
import { preflightBinding } from "./preflight.mjs";

export function assertAutomationRuntimeRoot(binding, moduleUrl = import.meta.url) {
  const executingRoot = path.resolve(path.dirname(fileURLToPath(moduleUrl)), "..", "..");
  const boundValue = binding?.resources?.runtime_checkout_root?.path;
  if (typeof boundValue !== "string") throw new BackupControllerError("automation_runtime_root_mismatch");
  const boundRoot = path.resolve(boundValue);
  if (executingRoot.toLowerCase() !== boundRoot.toLowerCase()) throw new BackupControllerError("automation_runtime_root_mismatch");
  return executingRoot;
}

export async function runDailyAutomation({
  activationSidecarRef,
  now = new Date(),
  resolveActivationImpl = resolveActivation,
  preflightImpl = preflightBinding,
  executorCatalogFactory = createFixedExecutorCatalog,
  dailyCycleImpl = dailyCycleController,
  runtimeRootVerifier = assertAutomationRuntimeRoot,
} = {}) {
  const activation = await resolveActivationImpl({ sidecarRef: activationSidecarRef, now });
  if (!activation.feature_enabled) {
    return {
      schema_version: "soulforge.backup_controller.automation_result.v1",
      operation: "daily_automation",
      status: "feature_off",
      observed_at: activation.observed_at,
      sidecar_sha256: activation.sidecar_sha256,
      binding_sha256: activation.binding_sha256,
      preflight_performed: false,
      write_performed: false,
    };
  }

  runtimeRootVerifier(activation.binding);
  const preflight = await preflightImpl(activation.binding, { allowWriteProbe: true });
  const catalog = executorCatalogFactory({ approvalRef: activation.sidecar.approval_ref });
  const cycle = await dailyCycleImpl({
    bindingRef: activation.sidecar.binding_ref,
    apply: true,
    expectedBindingSha256: activation.sidecar.expected_binding_sha256,
    approvalRef: activation.sidecar.approval_ref,
    now,
    executors: catalog.executors,
    receiptReconciler: catalog.receiptReconciler,
  });
  return {
    schema_version: "soulforge.backup_controller.automation_result.v1",
    operation: "daily_automation",
    status: cycle.status,
    observed_at: cycle.observed_at,
    sidecar_sha256: activation.sidecar_sha256,
    binding_sha256: activation.binding_sha256,
    preflight_performed: preflight.ok === true,
    write_performed: cycle.write_performed,
    cycle,
  };
}

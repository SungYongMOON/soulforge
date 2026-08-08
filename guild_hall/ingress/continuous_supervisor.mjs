import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

import { loadContinuousBinding, runContinuousIngress } from "./continuous_runner.mjs";

export const CONTINUOUS_SUPERVISOR_EVENT_SCHEMA = "soulforge.ingress.continuous_supervisor_event.v1";
export const CONTINUOUS_SUPERVISOR_RESULT_SCHEMA = "soulforge.ingress.continuous_supervisor_result.v1";
export const CONTINUOUS_SUPERVISOR_HEARTBEAT_SCHEMA = "soulforge.ingress.continuous_supervisor_heartbeat.v1";

const SAFE_CODE = /^[a-z0-9_]{1,128}$/;

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

export function safeSupervisorErrorCode(error) {
  const candidate = String(error?.code || error?.message || "continuous_supervisor_failed");
  return SAFE_CODE.test(candidate) ? candidate : "continuous_supervisor_failed";
}

export function abortableDelay(milliseconds, signal) {
  if (!Number.isSafeInteger(milliseconds) || milliseconds < 0) {
    fail("continuous_supervisor_delay_invalid");
  }
  if (signal?.aborted) return Promise.resolve(false);
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve(true);
    }, milliseconds);
    const onAbort = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      resolve(false);
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function supervisorEvent(event, fields = {}) {
  return {
    schema_version: CONTINUOUS_SUPERVISOR_EVENT_SCHEMA,
    event,
    ...fields,
  };
}

function assertRunnableBinding(binding) {
  if (!binding?.enabled) fail("continuous_supervisor_binding_disabled");
  if (!binding?.schedulerEnabled) fail("continuous_supervisor_scheduler_disabled");
  if (!Number.isSafeInteger(binding.pollIntervalSeconds)
    || binding.pollIntervalSeconds < 30
    || binding.pollIntervalSeconds > 86400) {
    fail("continuous_supervisor_poll_interval_invalid");
  }
}

function safeCycleSummary(result, cycle) {
  return supervisorEvent("cycle_completed", {
    cycle,
    status: result?.status || "unknown",
    run_id: result?.run_id || null,
    error_count: Array.isArray(result?.errors) ? result.errors.length : 0,
    error_codes: [...new Set((Array.isArray(result?.errors) ? result.errors : [])
      .map((row) => String(row?.code || ""))
      .filter((code) => SAFE_CODE.test(code)))].sort(),
    writes_performed: Number.isSafeInteger(result?.writes_performed)
      ? result.writes_performed
      : null,
    mail_status: result?.mail?.status ?? null,
    plaud_status: result?.plaud?.status ?? null,
    plaud_writer_enabled: result?.plaud?.writer_enabled ?? false,
    plaud_imported_count: result?.plaud?.imported_count ?? 0,
    plaud_post_import_warning_count: result?.plaud?.post_import_warning_count ?? 0,
    plaud_raw_written: Object.hasOwn(result?.plaud ?? {}, "raw_written")
      ? result.plaud.raw_written
      : false,
    plaud_ready_to_import_count: result?.plaud?.ready_to_import_count ?? 0,
    plaud_pending_provider_processing_count: result?.plaud?.pending_provider_processing_count ?? 0,
    plaud_cutover_ready: result?.plaud?.cutover_ready ?? false,
    mcp_written: result?.mcp_written ?? false,
    erp_written: result?.erp_written ?? false,
    project_promoted: result?.project_promoted ?? false,
  });
}

export function resolveSupervisorHeartbeatLedger(bindingPath) {
  if (typeof bindingPath !== "string" || !bindingPath) {
    fail("continuous_supervisor_binding_required");
  }
  const controlRoot = path.resolve(path.dirname(bindingPath));
  const stateRoot = path.resolve(controlRoot, "state");
  if (!stateRoot.startsWith(`${controlRoot}${path.sep}`)) {
    fail("continuous_supervisor_heartbeat_root_escaped");
  }
  return path.join(stateRoot, "continuous-supervisor-heartbeats.jsonl");
}

export function createSupervisorHeartbeatRecorder(options = {}) {
  const ledgerPath = resolveSupervisorHeartbeatLedger(options.bindingPath);
  const instanceId = options.instanceId || randomUUID();
  const now = options.now || (() => new Date());

  return async (cycleEvent) => {
    if (cycleEvent?.event !== "cycle_completed") {
      fail("continuous_supervisor_heartbeat_event_invalid");
    }
    const heartbeat = {
      schema_version: CONTINUOUS_SUPERVISOR_HEARTBEAT_SCHEMA,
      observed_at: now().toISOString(),
      instance_id: instanceId,
      cycle: cycleEvent.cycle,
      status: cycleEvent.status,
      error_count: cycleEvent.error_count,
      error_codes: Array.isArray(cycleEvent.error_codes) ? cycleEvent.error_codes : [],
      mail_status: cycleEvent.mail_status,
    };
    await mkdir(path.dirname(ledgerPath), { recursive: true });
    await appendFile(ledgerPath, `${JSON.stringify(heartbeat)}\n`, "utf8");
    return heartbeat;
  };
}

export async function runContinuousSupervisor(options = {}) {
  if (options.apply !== true) fail("continuous_supervisor_apply_required");
  if (typeof options.bindingPath !== "string" || !options.bindingPath) {
    fail("continuous_supervisor_binding_required");
  }
  if (typeof options.bindingDigest !== "string" || !options.bindingDigest) {
    fail("continuous_supervisor_binding_digest_required");
  }

  const loadBindingImpl = options.loadBindingImpl || loadContinuousBinding;
  const runCycleImpl = options.runCycleImpl || runContinuousIngress;
  const delayImpl = options.delayImpl || abortableDelay;
  const emit = options.emit || (() => {});
  const recordHeartbeat = options.recordHeartbeat || (async () => {});
  const signal = options.signal;
  const maxCycles = options.maxCycles ?? Number.POSITIVE_INFINITY;
  if (!(maxCycles === Number.POSITIVE_INFINITY
    || (Number.isSafeInteger(maxCycles) && maxCycles >= 1))) {
    fail("continuous_supervisor_max_cycles_invalid");
  }

  let cyclesCompleted = 0;
  emit(supervisorEvent("supervisor_started"));

  while (!signal?.aborted && cyclesCompleted < maxCycles) {
    const binding = await loadBindingImpl(options.bindingPath, {
      bindingDigest: options.bindingDigest,
    });
    assertRunnableBinding(binding);

    let result;
    try {
      result = await runCycleImpl({
        bindingPath: options.bindingPath,
        bindingDigest: options.bindingDigest,
        apply: true,
      });
    } catch (error) {
      emit(supervisorEvent("cycle_failed", {
        cycle: cyclesCompleted + 1,
        code: safeSupervisorErrorCode(error),
      }));
      throw error;
    }

    cyclesCompleted += 1;
    const cycleSummary = safeCycleSummary(result, cyclesCompleted);
    emit(cycleSummary);
    await recordHeartbeat(cycleSummary);
    if (cyclesCompleted >= maxCycles || signal?.aborted) break;

    const completedDelay = await delayImpl(binding.pollIntervalSeconds * 1000, signal);
    if (completedDelay === false) break;
  }

  const result = {
    schema_version: CONTINUOUS_SUPERVISOR_RESULT_SCHEMA,
    status: signal?.aborted ? "stopped" : "completed",
    cycles_completed: cyclesCompleted,
  };
  emit(supervisorEvent("supervisor_stopped", {
    status: result.status,
    cycles_completed: cyclesCompleted,
  }));
  return result;
}

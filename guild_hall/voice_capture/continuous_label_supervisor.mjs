import { runContinuousVoiceLabelWorker } from "./continuous_label_worker.mjs";

export const continuousVoiceLabelSupervisorEventSchemaVersion = "soulforge.voice.continuous_label_supervisor_event.v1";

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

export function safeVoiceLabelSupervisorErrorCode(error) {
  const candidate = String(error?.code ?? error?.message ?? "voice_label_supervisor_failed");
  return /^[a-z0-9_]{1,128}$/u.test(candidate) ? candidate : "voice_label_supervisor_failed";
}

export function abortableVoiceLabelDelay(milliseconds, signal) {
  if (!Number.isSafeInteger(milliseconds) || milliseconds < 0) {
    fail("voice_label_supervisor_delay_invalid");
  }
  if (signal?.aborted) return Promise.resolve(false);
  return new Promise((resolve) => {
    const onAbort = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      resolve(false);
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve(true);
    }, milliseconds);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function event(name, fields = {}) {
  return {
    schema_version: continuousVoiceLabelSupervisorEventSchemaVersion,
    event: name,
    ...fields,
  };
}

function safeCycleSummary(result, cycle) {
  return event("cycle_completed", {
    cycle,
    status: result?.status ?? "unknown",
    run_id: result?.run_id ?? null,
    asr_processed_count: Number(result?.asr?.processed_count ?? 0),
    asr_failed_count: Number(result?.asr?.failed_count ?? 0),
    asr_remaining_pending_count: Number(result?.asr?.remaining_pending_count ?? 0),
    label_processed_session_count: Number(result?.labels?.processed_session_count ?? 0),
    label_duplicate_session_count: Number(result?.labels?.duplicate_session_count ?? 0),
    label_failed_session_count: Number(result?.labels?.failed_session_count ?? 0),
    timeline_annotation_count: Number(result?.labels?.timeline_annotation_count ?? 0),
    raw_payload_copied: false,
    official_task_mutation_count: 0,
    official_project_assignment_mutation_count: 0,
  });
}

export async function runContinuousVoiceLabelSupervisor(options = {}) {
  if (options.apply !== true) fail("voice_label_supervisor_apply_required");
  const pollSeconds = Number(options.pollSeconds ?? 900);
  if (!Number.isSafeInteger(pollSeconds) || pollSeconds < 60 || pollSeconds > 86400) {
    fail("voice_label_supervisor_poll_seconds_invalid");
  }
  const maxCycles = options.maxCycles ?? Number.POSITIVE_INFINITY;
  if (!(maxCycles === Number.POSITIVE_INFINITY
    || (Number.isSafeInteger(maxCycles) && maxCycles >= 1))) {
    fail("voice_label_supervisor_max_cycles_invalid");
  }

  const runWorker = options.runWorkerImpl ?? runContinuousVoiceLabelWorker;
  const delay = options.delayImpl ?? abortableVoiceLabelDelay;
  const emit = options.emit ?? (() => {});
  const signal = options.signal;
  let cyclesCompleted = 0;
  emit(event("supervisor_started", { poll_seconds: pollSeconds }));

  while (!signal?.aborted && cyclesCompleted < maxCycles) {
    try {
      const result = await runWorker({
        repoRoot: options.repoRoot,
        expectedRuntimeRoot: options.expectedRuntimeRoot
          ?? process.env.SOULFORGE_VOICE_LABEL_EXPECTED_RUNTIME_ROOT,
        voiceRoot: options.voiceRoot,
        profileRef: options.profileRef,
        expectedProfileSha256: options.expectedProfileSha256,
        expectedAsrSha256: options.expectedAsrSha256,
        stateRoot: options.stateRoot,
        expectedStateRoot: options.expectedStateRoot
          ?? process.env.SOULFORGE_VOICE_LABEL_EXPECTED_STATE_ROOT,
        expectedAsrBinRoot: options.expectedAsrBinRoot
          ?? process.env.SOULFORGE_VOICE_LABEL_EXPECTED_ASR_BIN_ROOT,
        maxAsrSessions: options.maxAsrSessions,
        maxLabelSessions: options.maxLabelSessions,
        apply: true,
      });
      cyclesCompleted += 1;
      emit(safeCycleSummary(result, cyclesCompleted));
    } catch (error) {
      cyclesCompleted += 1;
      emit(event("cycle_failed", {
        cycle: cyclesCompleted,
        status: "failed",
        error_code: safeVoiceLabelSupervisorErrorCode(error),
        retry_required: true,
        raw_payload_copied: false,
        official_task_mutation_count: 0,
        official_project_assignment_mutation_count: 0,
      }));
    }
    if (cyclesCompleted >= maxCycles || signal?.aborted) break;
    if (await delay(pollSeconds * 1000, signal) === false) break;
  }

  const status = signal?.aborted ? "stopped" : "completed";
  emit(event("supervisor_stopped", { status, cycles_completed: cyclesCompleted }));
  return { status, cycles_completed: cyclesCompleted };
}

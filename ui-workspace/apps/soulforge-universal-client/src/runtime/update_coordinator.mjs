export const UPDATE_RECEIPT_SCHEMA = "soulforge.universal_client.update_receipt.v0";
export const UPDATE_STATUS = Object.freeze({ UPDATED: "UPDATED", ROLLED_BACK: "ROLLED_BACK", HOLD: "HOLD" });

const SAFE_REF = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/u;
const DIGEST = /^sha256:[0-9a-f]{64}$/u;
const INPUT_FIELDS = Object.freeze([
  "service_ref",
  "current_release_ref",
  "candidate_release_ref",
  "candidate_digest",
  "rollback_release_ref",
  "state_ref",
  "outbox_pending_count",
  "reboot_policy",
]);
const ADAPTER_FIELDS = Object.freeze([
  "verifyCandidate",
  "stopClient",
  "switchCurrent",
  "startClient",
  "checkHealth",
  "verifyStatePreserved",
  "calls",
]);

function fail(code) {
  const error = new TypeError(code);
  error.code = code;
  throw error;
}

function exact(value, fields, code) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(code);
  const keys = Object.keys(value).sort();
  const expected = [...fields].sort();
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) fail(code);
}

function ref(value) {
  if (typeof value !== "string" || !SAFE_REF.test(value) || value.includes("*")) fail("update_input_invalid");
  return value;
}

function freeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

function validateInput(input) {
  exact(input, INPUT_FIELDS, "update_input_invalid");
  if (input.service_ref !== "service.universal-client") fail("update_input_invalid");
  const current = ref(input.current_release_ref);
  const candidate = ref(input.candidate_release_ref);
  const rollback = ref(input.rollback_release_ref);
  if (candidate === current || rollback !== current) fail("update_input_invalid");
  if (typeof input.candidate_digest !== "string" || !DIGEST.test(input.candidate_digest)) fail("update_input_invalid");
  if (!Number.isSafeInteger(input.outbox_pending_count) || input.outbox_pending_count < 0) fail("update_input_invalid");
  if (input.reboot_policy !== "forbidden") fail("update_input_invalid");
  return {
    serviceRef: input.service_ref,
    current,
    candidate,
    rollback,
    candidateDigest: input.candidate_digest,
    stateRef: ref(input.state_ref),
    pending: input.outbox_pending_count,
  };
}

function validateAdapter(adapter) {
  if (!adapter || typeof adapter !== "object") fail("update_adapter_invalid");
  for (const field of ADAPTER_FIELDS.filter((name) => name !== "calls")) {
    if (typeof adapter[field] !== "function") fail("update_adapter_invalid");
  }
  return adapter;
}

async function requireOk(promise, code) {
  const result = await promise;
  if (!result || result.ok !== true) fail(code);
  return result;
}

async function rollbackCandidate(adapter, request, holdCode) {
  let rollbackOk = true;
  try { await requireOk(adapter.stopClient({ service_ref: request.serviceRef }), "rollback_stop_failed"); }
  catch { rollbackOk = false; }
  try { await requireOk(adapter.switchCurrent(request.rollback), "rollback_switch_failed"); }
  catch { rollbackOk = false; }
  try { await requireOk(adapter.startClient({ service_ref: request.serviceRef }), "rollback_start_failed"); }
  catch { rollbackOk = false; }
  // A mechanically complete rollback (stop/switch/start all reported ok) is not
  // itself proof the restored release is healthy — re-verify the same way the
  // forward path verifies the candidate, instead of reporting ROLLED_BACK on
  // trust. An unreadable status (checkHealth throws) is treated as unhealthy.
  let rollbackHealthy = false;
  if (rollbackOk) {
    try {
      const health = await adapter.checkHealth({ service_ref: request.serviceRef, release_ref: request.rollback });
      rollbackHealthy = !!health && health.ok === true;
    } catch { rollbackHealthy = false; }
  }
  const restored = rollbackOk && rollbackHealthy;
  return freeze({
    schema_version: UPDATE_RECEIPT_SCHEMA,
    status: restored ? UPDATE_STATUS.ROLLED_BACK : UPDATE_STATUS.HOLD,
    hold_code: restored ? holdCode : (rollbackOk ? "ROLLBACK_HEALTH_FAILED" : "ROLLBACK_INCOMPLETE_HOLD"),
    service_ref: request.serviceRef,
    current_release_ref: rollbackOk ? request.rollback : null,
    candidate_release_ref: request.candidate,
    reboot_requested: false,
    effects_performed: null,
    outbox_preserved: rollbackOk,
  });
}

export async function coordinateClientUpdate(input, adapterInput) {
  const request = validateInput(input);
  const adapter = validateAdapter(adapterInput);
  const verification = await requireOk(adapter.verifyCandidate({
    release_ref: request.candidate,
    release_digest: request.candidateDigest,
    reboot_policy: "forbidden",
  }), "candidate_verification_failed");
  if (verification.reboot_required === true) {
    return freeze({
      schema_version: UPDATE_RECEIPT_SCHEMA,
      status: UPDATE_STATUS.HOLD,
      hold_code: "REBOOT_REQUIRED_HOLD",
      service_ref: request.serviceRef,
      current_release_ref: request.current,
      candidate_release_ref: request.candidate,
      reboot_requested: false,
      effects_performed: 0,
      outbox_preserved: true,
    });
  }
  try {
    await requireOk(adapter.stopClient({ service_ref: request.serviceRef }), "client_stop_failed");
  } catch {
    return freeze({
      schema_version: UPDATE_RECEIPT_SCHEMA,
      status: UPDATE_STATUS.HOLD,
      hold_code: "CLIENT_STOP_FAILED",
      service_ref: request.serviceRef,
      current_release_ref: request.current,
      candidate_release_ref: request.candidate,
      reboot_requested: false,
      effects_performed: 0,
      outbox_preserved: true,
    });
  }
  try {
    await requireOk(adapter.switchCurrent(request.candidate), "current_switch_failed");
    await requireOk(adapter.startClient({ service_ref: request.serviceRef }), "client_start_failed");
    const health = await adapter.checkHealth({ service_ref: request.serviceRef, release_ref: request.candidate });
    if (!health || health.ok !== true) return rollbackCandidate(adapter, request, "CANDIDATE_HEALTH_FAILED");
    await requireOk(
      adapter.verifyStatePreserved({ state_ref: request.stateRef, pending_count: request.pending }),
      "client_state_not_preserved",
    );
  } catch (error) {
    const holdCode = error?.code === "client_state_not_preserved"
      ? "CLIENT_STATE_NOT_PRESERVED"
      : "CANDIDATE_ACTIVATION_FAILED";
    return rollbackCandidate(adapter, request, holdCode);
  }
  return freeze({
    schema_version: UPDATE_RECEIPT_SCHEMA,
    status: UPDATE_STATUS.UPDATED,
    hold_code: null,
    service_ref: request.serviceRef,
    current_release_ref: request.candidate,
    candidate_release_ref: request.candidate,
    reboot_requested: false,
    effects_performed: 5,
    outbox_preserved: true,
  });
}

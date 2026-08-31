export const OUTBOX_SCHEMA = "soulforge.universal_client.work_session_outbox.v0";
export const OUTBOX_STATUS = Object.freeze({ APPENDED: "APPENDED", ACKNOWLEDGED: "ACKNOWLEDGED", NO_OP: "NO_OP" });

const SAFE_REF = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/u;
const DIGEST = /^sha256:[0-9a-f]{64}$/u;
const FRAME_FIELDS = Object.freeze(["frame_ref", "sequence", "kind", "payload_ref", "payload_digest", "idempotency_key", "created_at"]);
const ACK_FIELDS = Object.freeze(["frame_ref", "sequence", "payload_digest", "receipt_ref", "acknowledged_at"]);

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

function ref(value, code) {
  if (typeof value !== "string" || !SAFE_REF.test(value) || value.includes("*")) fail(code);
  return value;
}

function timestamp(value, code) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) fail(code);
  return value;
}

function frozen(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) frozen(child);
    Object.freeze(value);
  }
  return value;
}

function copyState(state) {
  if (!state || state.schema_version !== OUTBOX_SCHEMA || !Array.isArray(state.frames)) fail("outbox_state_invalid");
  return structuredClone(state);
}

function frameEqual(left, right) {
  return FRAME_FIELDS.every((field) => left[field] === right[field]);
}

export function createWorkSessionOutbox(options = {}) {
  exact(options, ["session_ref", "device_ref", "project_ref"], "outbox_input_invalid");
  return frozen({
    schema_version: OUTBOX_SCHEMA,
    session_ref: ref(options.session_ref, "session_ref_invalid"),
    device_ref: ref(options.device_ref, "device_ref_invalid"),
    project_ref: ref(options.project_ref, "project_ref_invalid"),
    frames: [],
    acknowledged_through: 0,
    official_task_completed: false,
    accepted_knowledge_written: false,
  });
}

export function enqueueFrame(current, input) {
  const state = copyState(current);
  exact(input, FRAME_FIELDS, "frame_fields_invalid");
  const row = {
    frame_ref: ref(input.frame_ref, "frame_ref_invalid"),
    sequence: input.sequence,
    kind: ref(input.kind, "frame_kind_invalid"),
    payload_ref: ref(input.payload_ref, "payload_ref_invalid"),
    payload_digest: typeof input.payload_digest === "string" && DIGEST.test(input.payload_digest)
      ? input.payload_digest
      : fail("payload_digest_invalid"),
    idempotency_key: ref(input.idempotency_key, "idempotency_key_invalid"),
    created_at: timestamp(input.created_at, "created_at_invalid"),
    acknowledgement: null,
  };
  if (!Number.isSafeInteger(row.sequence) || row.sequence < 1) fail("sequence_invalid");
  const existing = state.frames.find((frame) => frame.frame_ref === row.frame_ref
    || frame.sequence === row.sequence
    || frame.idempotency_key === row.idempotency_key);
  if (existing) {
    const comparable = { ...existing };
    delete comparable.acknowledgement;
    if (!frameEqual(comparable, row)) fail("replay_conflict");
    return frozen({ status: OUTBOX_STATUS.NO_OP, state: current });
  }
  if (row.sequence !== state.frames.length + 1) fail("sequence_gap");
  state.frames.push(row);
  return frozen({ status: OUTBOX_STATUS.APPENDED, state: frozen(state) });
}

export function acknowledgeFrame(current, input) {
  const state = copyState(current);
  exact(input, ACK_FIELDS, "ack_fields_invalid");
  if (!Number.isSafeInteger(input.sequence) || input.sequence < 1) fail("ack_sequence_invalid");
  const frame = state.frames.find((entry) => entry.sequence === input.sequence && entry.frame_ref === input.frame_ref);
  if (!frame) fail("ack_frame_missing");
  if (typeof input.payload_digest !== "string" || input.payload_digest !== frame.payload_digest) fail("ack_digest_mismatch");
  const acknowledgement = {
    receipt_ref: ref(input.receipt_ref, "ack_receipt_ref_invalid"),
    acknowledged_at: timestamp(input.acknowledged_at, "acknowledged_at_invalid"),
    payload_digest: input.payload_digest,
  };
  if (frame.acknowledgement) {
    if (JSON.stringify(frame.acknowledgement) !== JSON.stringify(acknowledgement)) fail("ack_replay_conflict");
    return frozen({ status: OUTBOX_STATUS.NO_OP, state: current });
  }
  frame.acknowledgement = acknowledgement;
  let through = 0;
  for (const entry of state.frames) {
    if (!entry.acknowledgement) break;
    through = entry.sequence;
  }
  state.acknowledged_through = through;
  return frozen({ status: OUTBOX_STATUS.ACKNOWLEDGED, state: frozen(state) });
}

export function pendingFrames(current) {
  const state = copyState(current);
  return frozen(state.frames
    .filter((frame) => !frame.acknowledgement)
    .sort((left, right) => left.sequence - right.sequence));
}

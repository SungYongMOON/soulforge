import test from "node:test";
import assert from "node:assert/strict";

import {
  OUTBOX_STATUS,
  acknowledgeFrame,
  createWorkSessionOutbox,
  enqueueFrame,
  pendingFrames,
} from "../src/runtime/work_session_outbox.mjs";

const base = {
  session_ref: "session.alpha.1",
  device_ref: "device.alpha.1",
  project_ref: "project.alpha",
};

function frame(sequence, overrides = {}) {
  return {
    frame_ref: `frame.alpha.${sequence}`,
    sequence,
    kind: "result_candidate",
    payload_ref: `payload.alpha.${sequence}`,
    payload_digest: `sha256:${String(sequence).repeat(64)}`,
    idempotency_key: `idem-alpha-${sequence}`,
    created_at: `2026-09-01T00:0${sequence}:00.000Z`,
    ...overrides,
  };
}

test("frames append in exact order and replay is NO_OP", () => {
  let state = createWorkSessionOutbox(base);
  state = enqueueFrame(state, frame(1)).state;
  const replay = enqueueFrame(state, frame(1));
  assert.equal(replay.status, OUTBOX_STATUS.NO_OP);
  state = enqueueFrame(state, frame(2)).state;
  assert.deepEqual(pendingFrames(state).map((row) => row.sequence), [1, 2]);
  assert.equal(state.official_task_completed, false);
});

test("sequence gaps, divergent replay, foreign scope, and payload-shaped fields HOLD", () => {
  const state = createWorkSessionOutbox(base);
  assert.throws(() => enqueueFrame(state, frame(2)), /sequence_gap/u);
  const withOne = enqueueFrame(state, frame(1)).state;
  assert.throws(() => enqueueFrame(withOne, frame(1, { payload_ref: "payload.other" })), /replay_conflict/u);
  assert.throws(() => enqueueFrame(withOne, frame(2, { project_ref: "project.other" })), /frame_fields_invalid/u);
  assert.throws(() => enqueueFrame(withOne, frame(2, { raw_payload: "x" })), /frame_fields_invalid/u);
});

test("ACKs bind exact frame digest and advance only through contiguous acknowledged frames", () => {
  let state = createWorkSessionOutbox(base);
  state = enqueueFrame(state, frame(1)).state;
  state = enqueueFrame(state, frame(2)).state;
  state = acknowledgeFrame(state, {
    frame_ref: "frame.alpha.2",
    sequence: 2,
    payload_digest: frame(2).payload_digest,
    receipt_ref: "receipt.alpha.2",
    acknowledged_at: "2026-09-01T00:03:00.000Z",
  }).state;
  assert.equal(state.acknowledged_through, 0);
  state = acknowledgeFrame(state, {
    frame_ref: "frame.alpha.1",
    sequence: 1,
    payload_digest: frame(1).payload_digest,
    receipt_ref: "receipt.alpha.1",
    acknowledged_at: "2026-09-01T00:04:00.000Z",
  }).state;
  assert.equal(state.acknowledged_through, 2);
  assert.deepEqual(pendingFrames(state), []);
});

test("wrong ACK digest and duplicate receipt conflict are rejected", () => {
  let state = enqueueFrame(createWorkSessionOutbox(base), frame(1)).state;
  assert.throws(() => acknowledgeFrame(state, {
    frame_ref: "frame.alpha.1",
    sequence: 1,
    payload_digest: `sha256:${"9".repeat(64)}`,
    receipt_ref: "receipt.alpha.1",
    acknowledged_at: "2026-09-01T00:04:00.000Z",
  }), /ack_digest_mismatch/u);
  state = acknowledgeFrame(state, {
    frame_ref: "frame.alpha.1",
    sequence: 1,
    payload_digest: frame(1).payload_digest,
    receipt_ref: "receipt.alpha.1",
    acknowledged_at: "2026-09-01T00:04:00.000Z",
  }).state;
  assert.throws(() => acknowledgeFrame(state, {
    frame_ref: "frame.alpha.1",
    sequence: 1,
    payload_digest: frame(1).payload_digest,
    receipt_ref: "receipt.other",
    acknowledged_at: "2026-09-01T00:04:00.000Z",
  }), /ack_replay_conflict/u);
});

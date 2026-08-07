import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  createLifecycleReceipt,
  createLifecycleSnapshot,
  loadLifecycleReceipts,
  persistLifecycleReceipt,
  validateLifecycleSnapshot,
} from "./lifecycle_receipt.mjs";
import { runCli } from "./cli.mjs";

const IDENTITY_KEYS = ["agent_id", "agent_type", "session_id", "turn_id"];
const PROJECTION_KEYS = [
  "agent_id", "agent_type", "lifecycle_state", "observed_at", "result_state",
  "session_id", "source_event", "turn_id",
];

function hook(event, extra = {}) {
  return {
    hook_event_name: event,
    session_id: "session.lifecycle.001",
    turn_id: "turn.lifecycle.001",
    agent_id: "agent.lifecycle.001",
    agent_type: "worker",
    reason: "approval_needed",
    permission_mode: "on-request",
    stop_hook_active: true,
    ...extra,
  };
}

test("lifecycle receipts persist only the allowlisted metadata and replay duplicate IDs", async () => {
  const state = await mkdtemp(path.join(os.tmpdir(), "sf-lifecycle-receipt-"));
  try {
    const unsafe = hook("PermissionRequest", {
      prompt: "PROMPT-MUST-NOT-BE-PERSISTED",
      last_assistant_message: "MESSAGE-MUST-NOT-BE-PERSISTED",
      tool_input: { secret: "TOOL-INPUT-MUST-NOT-BE-PERSISTED" },
      tool_output: { secret: "TOOL-OUTPUT-MUST-NOT-BE-PERSISTED" },
      transcript_path: "private/transcript.jsonl",
      agent_transcript_path: "private/agent.jsonl",
      cwd: "private/workspace",
      arbitrary_raw_flag: "FLAG-MUST-NOT-BE-PERSISTED",
    });
    const receipt = createLifecycleReceipt(unsafe, { observedAt: "2026-08-04T00:00:01.000Z" });
    assert.deepEqual(Object.keys(receipt.identity).sort(), IDENTITY_KEYS);
    assert.equal(receipt.lifecycle_state, "waiting_on_approval");
    assert.equal(receipt.result_state, "result_pending");
    assert.equal(receipt.privacy.raw_content_fields_stored, 0);
    assert.equal(receipt.privacy.raw_flag_fields_stored, 0);
    assert.doesNotMatch(JSON.stringify(receipt), /PROMPT-MUST|MESSAGE-MUST|TOOL-|private|FLAG-MUST/u);

    const first = await persistLifecycleReceipt(state, receipt);
    const duplicate = createLifecycleReceipt(unsafe, { observedAt: "2026-08-04T00:01:01.000Z" });
    const replay = await persistLifecycleReceipt(state, duplicate);
    assert.equal(first.status, "created");
    assert.equal(replay.status, "replayed");
    assert.equal(first.receipt_id, replay.receipt_id);
    const loaded = await loadLifecycleReceipts(state);
    assert.equal(loaded.length, 1);
    assert.equal(loaded[0].observed_at, "2026-08-04T00:00:01.000Z");
    const current = JSON.parse(await readFile(path.join(state, "lifecycle", "current.json"), "utf8"));
    assert.equal(current.receipt_count, 1);
    assert.equal(current.raw_content_fields_stored, 0);
    assert.equal(current.raw_flag_fields_stored, 0);
    assert.equal(current.identities.length, 1);
    assert.doesNotMatch(JSON.stringify(current), /PROMPT-MUST|MESSAGE-MUST|TOOL-|private|FLAG-MUST/u);

    const aggregate = await runCli(["lifecycle-snapshot", "--state-root", state]);
    assert.equal(Object.hasOwn(aggregate, "identities"), false);
    const output = path.join(state, "lifecycle", "board-followup.local.json");
    const detailed = await runCli([
      "lifecycle-snapshot", "--state-root", state, "--include-identities", "--output", output,
    ]);
    assert.equal(detailed.identities.length, 1);
    assert.deepEqual(Object.keys(detailed.identities[0]).sort(), PROJECTION_KEYS);
    assert.deepEqual(JSON.parse(await readFile(output, "utf8")), detailed);
  } finally {
    await rm(state, { recursive: true, force: true });
  }
});

test("lifecycle snapshot reduces latest exact identities without treating input or stop as completion", () => {
  const receipts = [
    createLifecycleReceipt(hook("SessionStart", { turn_id: null, agent_id: null, agent_type: null }), {
      observedAt: "2026-08-04T00:00:00.000Z",
    }),
    createLifecycleReceipt(hook("UserPromptSubmit"), { observedAt: "2026-08-04T00:00:01.000Z" }),
    createLifecycleReceipt(hook("PermissionRequest"), { observedAt: "2026-08-04T00:00:02.000Z" }),
    createLifecycleReceipt(hook("Stop"), { observedAt: "2026-08-04T00:00:03.000Z" }),
    createLifecycleReceipt(hook("SessionEnd", { turn_id: null, agent_id: null, agent_type: null }), {
      observedAt: "2026-08-04T00:00:04.000Z",
    }),
  ];
  const aggregate = createLifecycleSnapshot(receipts, {
    generatedAt: "2026-08-04T00:01:00.000Z",
  });
  assert.equal(Object.hasOwn(aggregate, "identities"), false);
  assert.equal(aggregate.receipt_count, 5);
  assert.equal(aggregate.states.started, 1);
  assert.equal(aggregate.states.input_received, 1);
  assert.equal(aggregate.states.waiting_on_approval, 1);
  assert.equal(aggregate.states.observed_at_stop, 1);
  assert.equal(aggregate.states.ended, 1);
  assert.equal(aggregate.result_pending_count, 5);

  const detailed = createLifecycleSnapshot(receipts, {
    generatedAt: "2026-08-04T00:01:00.000Z",
    includeIdentities: true,
  });
  assert.equal(detailed.latest_identity_count, 2);
  const turn = detailed.identities.find((item) => item.turn_id === "turn.lifecycle.001");
  const session = detailed.identities.find((item) => item.turn_id === null);
  assert.deepEqual(Object.keys(turn).sort(), PROJECTION_KEYS);
  assert.equal(turn.lifecycle_state, "observed_at_stop");
  assert.equal(turn.result_state, "result_pending");
  assert.equal(session.lifecycle_state, "ended");
  assert.equal(session.result_state, "result_pending");
  assert.throws(
    () => validateLifecycleSnapshot({ ...detailed, cwd: "must-not-appear" }),
    { code: "lifecycle_snapshot_shape_invalid" },
  );
});

test("lifecycle sanitizer fails closed on malformed or unsupported hook input", () => {
  assert.throws(
    () => createLifecycleReceipt({ hook_event_name: "TurnStart", session_id: "session.lifecycle.001" }),
    { code: "hook_event_unsupported" },
  );
  assert.throws(
    () => createLifecycleReceipt({ hook_event_name: "SessionStart", session_id: "unsafe session id" }),
    { code: "hook_session_id_invalid" },
  );
  assert.throws(
    () => createLifecycleReceipt({ hook_event_name: "SubagentStop", session_id: "session.lifecycle.001" }),
    { code: "hook_subagent_id_missing" },
  );
});

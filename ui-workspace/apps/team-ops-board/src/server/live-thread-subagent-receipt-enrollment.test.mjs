import test from "node:test";
import assert from "node:assert/strict";

import {
  TEAM_OPS_BOARD_SUBAGENT_RECEIPT_ENROLLMENT_DISABLED,
  collectExactSubagentStartReceiptLineage
} from "./live-thread-subagent-receipt-enrollment.mjs";

const AT = "2026-08-06T01:02:03.000Z";
const NOW = () => Date.parse(AT);

function identity({
  sessionId = "parent-current",
  agentId = "child-exact",
  turnId = "turn-one",
  sourceEvent = "SubagentStart",
  lifecycleState = "started",
  observedAt = AT,
  extra = {}
} = {}) {
  return {
    session_id: sessionId,
    turn_id: turnId,
    agent_id: agentId,
    agent_type: "worker",
    lifecycle_state: lifecycleState,
    result_state: "result_pending",
    observed_at: observedAt,
    source_event: sourceEvent,
    ...extra
  };
}

function source(identities) {
  return { status: "available", snapshot: { identities } };
}

test("persisted SubagentStart identity produces only an exact safe child lineage", () => {
  const result = collectExactSubagentStartReceiptLineage({
    source: source([identity({
      extra: {
        title: "RAW_TITLE_MUST_NOT_RETAIN",
        cwd: "RAW_CWD_MUST_NOT_RETAIN",
        prompt: "RAW_PROMPT_MUST_NOT_RETAIN"
      }
    })]),
    now: NOW
  });

  assert.deepEqual(result.candidates, []);
  assert.equal(result.malformed_count, 1);
  assert.deepEqual(result.unsafe_thread_ids, ["child-exact"]);
  const serialized = JSON.stringify(result);
  for (const raw of ["RAW_TITLE_MUST_NOT_RETAIN", "RAW_CWD_MUST_NOT_RETAIN", "RAW_PROMPT_MUST_NOT_RETAIN"]) {
    assert.equal(serialized.includes(raw), false);
  }

  const safe = collectExactSubagentStartReceiptLineage({ source: source([identity()]), now: NOW });
  assert.deepEqual(safe.candidates, [{
    thread_id: "child-exact",
    parent_thread_id: "parent-current",
    status_type: "active"
  }]);
  assert.equal(JSON.stringify(safe).includes("turn-one"), false);
});

test("receipt replay deduplicates while conflicting parent IDs and newer stop evidence hold the child", () => {
  const replayed = collectExactSubagentStartReceiptLineage({
    source: source([identity(), identity()]),
    now: NOW
  });
  assert.equal(replayed.replayed_count, 1);
  assert.equal(replayed.candidates.length, 1);

  const conflicted = collectExactSubagentStartReceiptLineage({
    source: source([
      identity({ sessionId: "parent-one" }),
      identity({ sessionId: "parent-two", turnId: "turn-two", observedAt: "2026-08-06T01:02:04.000Z" })
    ]),
    now: () => Date.parse("2026-08-06T01:02:04.000Z")
  });
  assert.equal(conflicted.conflicted_count, 1);
  assert.deepEqual(conflicted.candidates, []);
  assert.deepEqual(conflicted.unsafe_thread_ids, ["child-exact"]);

  const stopped = collectExactSubagentStartReceiptLineage({
    source: source([
      identity({ observedAt: "2026-08-06T01:02:03.000Z" }),
      identity({
        turnId: "turn-two",
        sourceEvent: "SubagentStop",
        lifecycleState: "observed_at_stop",
        observedAt: "2026-08-06T01:02:04.000Z"
      })
    ]),
    now: () => Date.parse("2026-08-06T01:02:04.000Z")
  });
  assert.equal(stopped.terminal_count, 1);
  assert.deepEqual(stopped.candidates, []);
  assert.deepEqual(stopped.unsafe_thread_ids, ["child-exact"]);
});

test("missing, malformed, and emergency-disabled receipt inputs never create a candidate", () => {
  assert.equal(collectExactSubagentStartReceiptLineage({ source: { status: "missing" }, now: NOW }).status, "hold");

  const malformed = collectExactSubagentStartReceiptLineage({
    source: source([
      identity({
        agentId: "child-malformed",
        extra: { raw_payload: "MUST_NOT_RETAIN" }
      }),
      identity({ agentId: "child-malformed" })
    ]),
    now: NOW
  });
  assert.equal(malformed.malformed_count, 1);
  assert.deepEqual(malformed.candidates, []);
  assert.deepEqual(malformed.unsafe_thread_ids, ["child-malformed"]);
  assert.equal(JSON.stringify(malformed).includes("MUST_NOT_RETAIN"), false);

  const stale = collectExactSubagentStartReceiptLineage({
    source: source([identity({ observedAt: "2026-08-06T01:00:00.000Z" })]),
    now: () => Date.parse("2026-08-06T01:06:00.000Z")
  });
  assert.deepEqual(stale.candidates, []);

  const disabled = collectExactSubagentStartReceiptLineage({
    source: source([identity()]),
    env: { [TEAM_OPS_BOARD_SUBAGENT_RECEIPT_ENROLLMENT_DISABLED]: "on" },
    now: NOW
  });
  assert.equal(disabled.status, "disabled");
  assert.deepEqual(disabled.candidates, []);
});

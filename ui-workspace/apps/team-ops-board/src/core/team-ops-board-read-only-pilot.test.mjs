import assert from "node:assert/strict";
import test from "node:test";

import {
  TEAM_OPS_BOARD_READ_ONLY_PILOT,
  createTeamOpsBoardRuntimeEnvironment,
  createTeamOpsBoardTopologyOptions,
  isTeamOpsBoardReadOnlyPilot,
} from "./team-ops-board-read-only-pilot.mjs";

test("TEAM_OPS_BOARD_READ_ONLY_PILOT only enables the exact string value 1", () => {
  assert.equal(TEAM_OPS_BOARD_READ_ONLY_PILOT, "TEAM_OPS_BOARD_READ_ONLY_PILOT");
  assert.equal(isTeamOpsBoardReadOnlyPilot({ [TEAM_OPS_BOARD_READ_ONLY_PILOT]: "1" }), true);

  for (const value of [undefined, null, "", "0", "01", "true", "on", " 1", "1 ", 1, true]) {
    assert.equal(isTeamOpsBoardReadOnlyPilot({ [TEAM_OPS_BOARD_READ_ONLY_PILOT]: value }), false);
  }
});

test("TEAM_OPS_BOARD_READ_ONLY_PILOT fails closed for absent or unusable environments", () => {
  assert.equal(isTeamOpsBoardReadOnlyPilot({}), false);
  assert.equal(isTeamOpsBoardReadOnlyPilot(null), false);
  assert.equal(isTeamOpsBoardReadOnlyPilot(Object.create(null)), false);
});

test("topology options enable read-only mode only for the exact pilot value", () => {
  assert.deepEqual(
    createTeamOpsBoardTopologyOptions({ [TEAM_OPS_BOARD_READ_ONLY_PILOT]: "1" }),
    { readOnlyPilot: true },
  );
  for (const value of [undefined, null, "", "0", "true", " 1", "1 ", 1, true]) {
    assert.deepEqual(
      createTeamOpsBoardTopologyOptions({ [TEAM_OPS_BOARD_READ_ONLY_PILOT]: value }),
      { readOnlyPilot: false },
    );
  }
});

test("read-only pilot composes existing write disables without mutating its source environment", () => {
  const source = Object.freeze({
    [TEAM_OPS_BOARD_READ_ONLY_PILOT]: "1",
    TEAM_OPS_BOARD_AUTO_ENROLLMENT_DISABLED: "0",
    TEAM_OPS_BOARD_SUBAGENT_RECEIPT_ENROLLMENT_DISABLED: "0",
    TEAM_OPS_BOARD_AUTO_LIFECYCLE_RECONCILE: "true",
    TEAM_OPS_BOARD_RESULT_GATES_DISABLED: "0"
  });

  const runtime = createTeamOpsBoardRuntimeEnvironment(source);

  assert.notEqual(runtime, source);
  assert.equal(runtime.TEAM_OPS_BOARD_AUTO_ENROLLMENT_DISABLED, "1");
  assert.equal(runtime.TEAM_OPS_BOARD_SUBAGENT_RECEIPT_ENROLLMENT_DISABLED, "1");
  assert.equal(runtime.TEAM_OPS_BOARD_AUTO_LIFECYCLE_RECONCILE, "false");
  assert.equal(runtime.TEAM_OPS_BOARD_RESULT_GATES_DISABLED, "1");
  assert.equal(source.TEAM_OPS_BOARD_AUTO_ENROLLMENT_DISABLED, "0");
  const standard = {};
  assert.equal(createTeamOpsBoardRuntimeEnvironment(standard), standard);
});

import assert from "node:assert/strict";
import test from "node:test";

import { TEAM_OPS_BOARD_READ_ONLY_PILOT } from "../core/team-ops-board-read-only-pilot.mjs";
import { createProviderLimitsReader } from "./provider-limits-adapter.mjs";

test("read-only pilot leaves Claude provider limits UNKNOWN without credential or OAuth access", async () => {
  let codexReads = 0;
  let claudeReads = 0;
  const reader = createProviderLimitsReader({
    env: { [TEAM_OPS_BOARD_READ_ONLY_PILOT]: "1" },
    now: () => Date.parse("2026-08-09T00:00:00.000Z"),
    readCodexLimitsImpl: async () => {
      codexReads += 1;
      return {
        primary: { used_percent: 12, window_minutes: 300, resets_at_epoch_s: null },
        secondary: null,
        plan_type: "test",
        observed_at: "2026-08-09T00:00:00.000Z"
      };
    },
    readClaudeLimitsImpl: async () => {
      claudeReads += 1;
      return {
        five_hour: { utilization: 0, resets_at: null },
        seven_day: null,
        model_windows: []
      };
    }
  });

  const snapshot = await reader.readSnapshot();

  assert.equal(codexReads, 1);
  assert.equal(claudeReads, 0);
  assert.equal(snapshot.claude, null);
  assert.equal(snapshot.codex.primary.used_percent, 12);
});

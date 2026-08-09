import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { buildClaudeQuotaPresentation } from "./provider-limits.mjs";

const APP_PATH = join(dirname(dirname(fileURLToPath(import.meta.url))), "App.tsx");

const LAST_KNOWN = {
  five_hour: { utilization: 0, resets_at: "2026-08-09T05:00:00Z" },
  seven_day: { utilization: 18, resets_at: "2026-08-16T00:00:00Z" },
  model_windows: [],
  observed_at: "2026-08-09T00:00:00Z",
};

function snapshotWithStatus(state, outcome, freshness, claude = LAST_KNOWN) {
  return {
    schema_version: "soulforge.team_ops_board_provider_limits.v2",
    claude,
    claude_status: {
      state,
      outcome,
      attempted_at: state === "disabled" ? null : "2026-08-09T00:02:00Z",
      last_success_at: claude === null ? null : "2026-08-09T00:00:00Z",
      freshness,
    },
  };
}

test("Claude quota presentation distinguishes success, stale, error, disabled, and unknown", () => {
  const ready = buildClaudeQuotaPresentation(snapshotWithStatus("ready", "success", "current"));
  assert.equal(ready.status.state, "ready");
  assert.equal(ready.current, true);
  assert.equal(ready.value_state, "current");
  assert.equal(ready.claude.five_hour.utilization, 0);

  const stale = buildClaudeQuotaPresentation(snapshotWithStatus("stale", "rate_limited", "stale"));
  assert.equal(stale.status.state, "stale");
  assert.equal(stale.current, false);
  assert.equal(stale.value_state, "last_known");
  assert.equal(stale.claude.seven_day.utilization, 18);

  const error = buildClaudeQuotaPresentation(snapshotWithStatus("error", "auth_failed", "current"));
  assert.equal(error.status.state, "error");
  assert.equal(error.current, false);
  assert.equal(error.value_state, "last_known");

  const disabled = buildClaudeQuotaPresentation(snapshotWithStatus("disabled", "disabled", "unknown", null));
  assert.equal(disabled.status.state, "disabled");
  assert.equal(disabled.current, false);
  assert.equal(disabled.value_state, "unavailable");
  assert.equal(disabled.claude, null);

  const unknown = buildClaudeQuotaPresentation(null);
  assert.equal(unknown.status.state, "unknown");
  assert.equal(unknown.current, false);
  assert.equal(unknown.value_state, "unavailable");
  assert.equal(unknown.claude, null);
});

test("legacy v1 last-known values remain visible but never become current", () => {
  const legacy = buildClaudeQuotaPresentation({
    schema_version: "soulforge.team_ops_board_provider_limits.v1",
    claude: LAST_KNOWN,
  });
  assert.equal(legacy.status.state, "unknown");
  assert.equal(legacy.status.freshness, "unknown");
  assert.equal(legacy.current, false);
  assert.equal(legacy.value_state, "last_known");
  assert.equal(legacy.claude.five_hour.utilization, 0);
});

test("official Claude quota row is independent of common Meter history and fails closed visually", () => {
  const source = readFileSync(APP_PATH, "utf8");
  assert.match(source, /buildClaudeQuotaPresentation\(providers\?\.limits \?\? null\)/u);
  assert.doesNotMatch(source, /if \(!windows\) return null;/u);
  assert.match(source, /const week = windows\?\.calendar_week/u);
  assert.match(source, /key: "claude_official_status"[\s\S]*percent: null,[\s\S]*severity: "idle"/u);
  assert.match(source, /severity: claudeQuota\.current \? severityFor[\s\S]*: "idle"/u);
  assert.match(source, /claudeStatus\.state\.toUpperCase\(\)/u);
  assert.match(source, /마지막 성공 UNKNOWN/u);
  assert.match(source, /usage\?\.provider_evidence\?\.claude/u);
  assert.doesNotMatch(source, /claudeOfficial\s*=\s*claudeEvidence/u);
});

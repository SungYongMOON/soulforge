import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { buildClaudeQuotaPresentation } from "./provider-limits.mjs";

const APP_PATH = join(dirname(dirname(fileURLToPath(import.meta.url))), "App.tsx");

function officialSnapshot(captureStatus = "accepted", freshness = "fresh") {
  return {
    schema_version: "soulforge.team_ops_board_provider_limits.v3",
    claude_official: {
      capture_status: captureStatus,
      freshness,
      source_kind: "claude_code_statusline_rate_limits",
      observed_at: "2026-08-09T00:00:00Z",
      five_hour: { limit_id: "claude_five_hour", percentage_kind: "used_percentage", percentage: 0, window_minutes: 300, resets_at: "2026-08-09T05:00:00Z" },
      weekly: { limit_id: "claude_weekly", percentage_kind: "used_percentage", percentage: 18, window_minutes: 10_080, resets_at: "2026-08-16T00:00:00Z" },
      fable_weekly: null,
    },
  };
}

test("Claude quota presentation distinguishes current, stale, and unknown", () => {
  const ready = buildClaudeQuotaPresentation(officialSnapshot());
  assert.equal(ready.status.state, "ready");
  assert.equal(ready.current, true);
  assert.equal(ready.value_state, "current");
  assert.equal(ready.claude.five_hour.utilization, 0);

  const stale = buildClaudeQuotaPresentation(officialSnapshot("hold", "stale"));
  assert.equal(stale.status.state, "stale");
  assert.equal(stale.current, false);
  assert.equal(stale.value_state, "last_known");
  assert.equal(stale.claude.seven_day.utilization, 18);

  const unknown = buildClaudeQuotaPresentation(null);
  assert.equal(unknown.status.state, "unknown");
  assert.equal(unknown.current, false);
  assert.equal(unknown.value_state, "unavailable");
  assert.equal(unknown.claude.five_hour, null);
});

test("legacy provider payloads remain UNKNOWN and never become current", () => {
  const legacy = buildClaudeQuotaPresentation({
    schema_version: "soulforge.team_ops_board_provider_limits.v1",
    claude: { five_hour: { utilization: 0 } },
  });
  assert.equal(legacy.status.state, "unknown");
  assert.equal(legacy.status.freshness, "unknown");
  assert.equal(legacy.current, false);
  assert.equal(legacy.value_state, "unavailable");
  assert.equal(legacy.claude.five_hour, null);
});

test("official Claude quota row is independent of common Meter history and fails closed visually", () => {
  const source = readFileSync(APP_PATH, "utf8");
  assert.match(source, /buildClaudeQuotaPresentation\(providers\?\.limits \?\? null\)/u);
  assert.doesNotMatch(source, /if \(!windows\) return null;/u);
  assert.match(source, /const week = windows\?\.calendar_week/u);
  assert.match(source, /key: "claude_official_status"[\s\S]*percent: null,[\s\S]*severity: "idle"/u);
  assert.match(source, /severity: severityFor\(Number\(claudeFiveHour\.utilization\), false\),[\s\S]*stale: !claudeQuota\.current/u);
  assert.match(source, /className=\{`fleet-limit-row is-\$\{row\.severity\}\$\{row\.stale \? " is-stale" : ""\}`\}/u);
  assert.match(source, /data-freshness=\{row\.stale \? "stale" : "current"\}/u);
  assert.match(source, /Antigravity 2\.0 실행 중 · 안전한 한도 원천 미연결/u);
  assert.match(source, /schema_version === ANTIGRAVITY_QUOTA_SCHEMA_VERSION[\s\S]*freshness === "current"/u);
  assert.doesNotMatch(source, /IDE 실행 시 갱신/u);
  assert.match(source, /claudeStatus\.state\.toUpperCase\(\)/u);
  assert.match(source, /마지막 성공 UNKNOWN/u);
  assert.match(source, /usage\?\.provider_evidence\?\.claude/u);
  assert.doesNotMatch(source, /claudeOfficial\s*=\s*claudeEvidence/u);
});

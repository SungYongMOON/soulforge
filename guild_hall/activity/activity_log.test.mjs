import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  ACTIVITY_EVENT_SCHEMA_VERSION,
  appendActivityEvent,
  refreshLatestContext,
  sanitizeActivityValue,
} from "./activity_log.mjs";

test("appendActivityEvent writes monthly event ledger and latest context", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-activity-"));
  const activityRoot = path.join(repoRoot, "guild_hall", "state", "operations", "soulforge_activity");

  try {
    await writeNodeIdentity(repoRoot);

    const result = await appendActivityEvent({
      repoRoot,
      activityRoot,
      now: new Date("2026-05-08T01:02:03.000Z"),
      input: {
        scope: "healer",
        action: "smoke_test",
        result: "completed",
        summary: "activity logger smoke test completed",
        refs: ["docs/architecture/guild_hall/SOULFORGE_ACTIVITY_LOG_V0.md"],
        next_action: "Use latest_context.json for handoff.",
        carry_forward: true,
      },
    });

    assert.equal(result.event.schema_version, ACTIVITY_EVENT_SCHEMA_VERSION);
    assert.equal(result.event.node_id, "test_node_01");
    assert.equal(result.event.node_role, "always_on_node");
    assert.equal(result.event.scope, "healer");
    assert.equal(result.event.project_code, "shared");

    const ledgerRaw = await readFile(result.events_path, "utf8");
    const ledgerRows = ledgerRaw.trim().split("\n").map((line) => JSON.parse(line));
    assert.equal(ledgerRows.length, 1);
    assert.equal(ledgerRows[0].entry_id, result.event.entry_id);

    const latest = JSON.parse(await readFile(result.latest_context_path, "utf8"));
    assert.equal(latest.recent_entries[0].entry_id, result.event.entry_id);
    assert.equal(latest.open_threads[0].entry_id, result.event.entry_id);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("refreshLatestContext keeps newest entries first", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-activity-refresh-"));
  const activityRoot = path.join(repoRoot, "guild_hall", "state", "operations", "soulforge_activity");

  try {
    await appendActivityEvent({
      repoRoot,
      activityRoot,
      now: new Date("2026-05-08T01:00:00.000Z"),
      input: { scope: "test", action: "old_event", summary: "older event" },
    });
    const newest = await appendActivityEvent({
      repoRoot,
      activityRoot,
      now: new Date("2026-05-08T02:00:00.000Z"),
      input: { scope: "test", action: "new_event", summary: "newer event" },
    });

    const latest = await refreshLatestContext({ activityRoot, now: new Date("2026-05-08T03:00:00.000Z") });
    assert.equal(latest.recent_entries[0].entry_id, newest.event.entry_id);
    assert.equal(latest.recent_entries.length, 2);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("sanitizeActivityValue redacts sensitive field names and token-like text", () => {
  assert.equal(sanitizeActivityValue("<html><body>mail</body></html>", "raw_body"), "[redacted:sensitive-field]");
  assert.equal(sanitizeActivityValue("token=abc1234567890", "summary"), "token=[redacted]");
  assert.equal(
    sanitizeActivityValue("<html><body>very long html mail body that should not be logged as a human summary because it is raw content</body></html>", "summary"),
    "[redacted:possible-raw-html]",
  );
});

async function writeNodeIdentity(repoRoot) {
  const identityDir = path.join(repoRoot, "guild_hall", "state", "local");
  await mkdir(identityDir, { recursive: true });
  await writeFile(
    path.join(identityDir, "node_identity.yaml"),
    [
      "schema_version: soulforge.local_node.v0",
      "node_id: test_node_01",
      "node_role: always_on_node",
      "bootstrap_profile: owner-with-state",
    ].join("\n"),
    "utf8",
  );
}

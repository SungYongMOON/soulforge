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
import { mergeActivitySurfaces, syncActivityToPrivateState } from "./activity_sync.mjs";

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

test("mergeActivitySurfaces combines local and private activity ledgers", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-activity-sync-"));
  const activityRoot = path.join(repoRoot, "guild_hall", "state", "operations", "soulforge_activity");
  const privateActivityRoot = path.join(repoRoot, "private-state", "guild_hall", "state", "operations", "soulforge_activity");

  try {
    const localEvent = await appendActivityEvent({
      repoRoot,
      activityRoot,
      identity: {
        node_id: "work_pc_01",
        node_role: "work_pc",
        bootstrap_profile: "owner-with-state",
      },
      now: new Date("2026-05-08T01:00:00.000Z"),
      input: {
        scope: "work_pc",
        action: "project_note",
        result: "completed",
        summary: "work pc left a public-safe project activity note",
        carry_forward: true,
      },
    });
    const privateEvent = await appendActivityEvent({
      repoRoot,
      activityRoot: privateActivityRoot,
      identity: {
        node_id: "tool_pc_01",
        node_role: "tool_pc",
        bootstrap_profile: "owner-with-state",
      },
      now: new Date("2026-05-08T02:00:00.000Z"),
      input: {
        scope: "tool_pc",
        action: "tool_smoke",
        result: "completed",
        summary: "tool pc left a public-safe tool activity note",
      },
    });

    const merge = await mergeActivitySurfaces({
      activityRoot,
      privateActivityRoot,
      now: new Date("2026-05-08T03:00:00.000Z"),
    });

    assert.equal(merge.local_event_count_before, 1);
    assert.equal(merge.private_event_count_before, 1);
    assert.equal(merge.merged_event_count, 2);
    assert.equal(merge.added_to_local, 1);
    assert.equal(merge.added_to_private, 1);

    const localRows = await readMonthlyRows(activityRoot, "2026", "2026-05");
    const privateRows = await readMonthlyRows(privateActivityRoot, "2026", "2026-05");
    assert.deepEqual(
      localRows.map((row) => row.entry_id).sort(),
      [localEvent.event.entry_id, privateEvent.event.entry_id].sort(),
    );
    assert.deepEqual(
      privateRows.map((row) => row.entry_id).sort(),
      [localEvent.event.entry_id, privateEvent.event.entry_id].sort(),
    );

    const latest = JSON.parse(await readFile(path.join(activityRoot, "latest_context.json"), "utf8"));
    assert.equal(latest.recent_entries[0].entry_id, privateEvent.event.entry_id);
    assert.equal(latest.open_threads[0].entry_id, localEvent.event.entry_id);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("mergeActivitySurfaces preserves malformed rows and sanitizes mirrored legacy fields", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-activity-sync-safety-"));
  const activityRoot = path.join(repoRoot, "guild_hall", "state", "operations", "soulforge_activity");
  const privateActivityRoot = path.join(repoRoot, "private-state", "guild_hall", "state", "operations", "soulforge_activity");
  const localEventsPath = path.join(activityRoot, "events", "2026", "2026-05.jsonl");

  try {
    await mkdir(path.dirname(localEventsPath), { recursive: true });
    await writeFile(
      localEventsPath,
      [
        JSON.stringify({
          entry_id: "legacy_sensitive_001",
          occurred_at: "2026-05-08T01:00:00.000Z",
          date: "2026-05-08",
          node_id: "legacy_node",
          node_role: "work_pc",
          scope: "legacy",
          action: "manual_note",
          summary: "token=abc1234567890",
          raw_body: "<html><body>do not mirror</body></html>",
          attachment_content: "do not mirror",
        }),
        "{malformed-json-row",
      ].join("\n") + "\n",
      "utf8",
    );

    const merge = await mergeActivitySurfaces({
      activityRoot,
      privateActivityRoot,
      now: new Date("2026-05-08T03:00:00.000Z"),
    });

    assert.equal(merge.malformed_rows_preserved_local, 1);
    assert.equal(merge.added_to_private, 1);

    const localRaw = await readFile(localEventsPath, "utf8");
    assert.equal(localRaw.includes("{malformed-json-row"), true);
    assert.equal(localRaw.includes("raw_body"), true);

    const privateRaw = await readFile(path.join(privateActivityRoot, "events", "2026", "2026-05.jsonl"), "utf8");
    assert.equal(privateRaw.includes("raw_body"), false);
    assert.equal(privateRaw.includes("attachment_content"), false);
    assert.equal(privateRaw.includes("abc1234567890"), false);
    assert.equal(privateRaw.includes("token=[redacted]"), true);

    const latest = JSON.parse(await readFile(path.join(activityRoot, "latest_context.json"), "utf8"));
    assert.equal(JSON.stringify(latest).includes("raw_body"), false);
    assert.equal(JSON.stringify(latest).includes("abc1234567890"), false);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("mergeActivitySurfaces is idempotent when no events changed", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-activity-sync-idempotent-"));
  const activityRoot = path.join(repoRoot, "guild_hall", "state", "operations", "soulforge_activity");
  const privateActivityRoot = path.join(repoRoot, "private-state", "guild_hall", "state", "operations", "soulforge_activity");

  try {
    await appendActivityEvent({
      repoRoot,
      activityRoot,
      now: new Date("2026-05-08T01:00:00.000Z"),
      input: { scope: "test", action: "sync_seed", summary: "seed event" },
    });

    await mergeActivitySurfaces({
      activityRoot,
      privateActivityRoot,
      now: new Date("2026-05-08T02:00:00.000Z"),
    });
    const firstLatest = await readFile(path.join(privateActivityRoot, "latest_context.json"), "utf8");

    const second = await mergeActivitySurfaces({
      activityRoot,
      privateActivityRoot,
      now: new Date("2026-05-08T03:00:00.000Z"),
    });
    const secondLatest = await readFile(path.join(privateActivityRoot, "latest_context.json"), "utf8");

    assert.equal(second.added_to_local, 0);
    assert.equal(second.added_to_private, 0);
    assert.equal(second.latest_context_updated_private, false);
    assert.equal(secondLatest, firstLatest);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("syncActivityToPrivateState blocks private-state sync outside main branch", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-activity-sync-branch-"));
  const privateStateRoot = path.join(repoRoot, "private-state");

  try {
    await mkdir(path.join(privateStateRoot, ".git"), { recursive: true });
    const result = await syncActivityToPrivateState({
      repoRoot,
      privateStateRoot,
      skipPull: true,
      runCommand: async ({ args }) => {
        if (args.join(" ") === "status --porcelain") {
          return { ok: true, status: 0, stdout: "", stderr: "" };
        }
        if (args.join(" ") === "branch --show-current") {
          return { ok: true, status: 0, stdout: "feature\n", stderr: "" };
        }
        throw new Error(`unexpected command: git ${args.join(" ")}`);
      },
    });

    assert.equal(result.status, "blocked");
    assert.equal(result.reason, "private_state_branch_not_main");
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("syncActivityToPrivateState blocks private-state roots outside the nested repo", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-activity-sync-root-"));
  const outsidePrivateStateRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-private-state-outside-"));

  try {
    await mkdir(path.join(outsidePrivateStateRoot, ".git"), { recursive: true });
    const result = await syncActivityToPrivateState({
      repoRoot,
      privateStateRoot: outsidePrivateStateRoot,
      skipPull: true,
      runCommand: async () => {
        throw new Error("git should not run for invalid private-state root");
      },
    });

    assert.equal(result.status, "blocked");
    assert.equal(result.reason, "private_state_root_must_be_nested_private_state");
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
    await rm(outsidePrivateStateRoot, { recursive: true, force: true });
  }
});

test("syncActivityToPrivateState blocks private-state sync without origin remote", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-activity-sync-origin-"));
  const privateStateRoot = path.join(repoRoot, "private-state");

  try {
    await mkdir(path.join(privateStateRoot, ".git"), { recursive: true });
    const result = await syncActivityToPrivateState({
      repoRoot,
      privateStateRoot,
      skipPull: true,
      runCommand: async ({ args }) => {
        if (args.join(" ") === "status --porcelain") {
          return { ok: true, status: 0, stdout: "", stderr: "" };
        }
        if (args.join(" ") === "branch --show-current") {
          return { ok: true, status: 0, stdout: "main\n", stderr: "" };
        }
        if (args.join(" ") === "remote get-url origin") {
          return { ok: false, status: 2, stdout: "", stderr: "No such remote 'origin'\n" };
        }
        throw new Error(`unexpected command: git ${args.join(" ")}`);
      },
    });

    assert.equal(result.status, "blocked");
    assert.equal(result.reason, "private_state_origin_missing");
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

async function readMonthlyRows(activityRoot, year, yearMonth) {
  const raw = await readFile(path.join(activityRoot, "events", year, `${yearMonth}.jsonl`), "utf8");
  return raw.trim().split("\n").filter(Boolean).map((line) => JSON.parse(line));
}

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

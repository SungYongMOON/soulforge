import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  ACTIVITY_EVENT_SCHEMA_VERSION,
  appendActivityEvent,
  readRecentActivityEvents,
  refreshLatestContext,
  sanitizeActivityValue,
} from "./activity_log.mjs";
import { mergeActivitySurfaces, syncActivityToPrivateState } from "./activity_sync.mjs";
import { projectMailCandidatesToActivity } from "./mail_candidate_projection.mjs";

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

test("readRecentActivityEvents honors an explicit measurement window above the recent-context default", async () => {
  const activityRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-activity-window-"));
  try {
    const eventRoot = path.join(activityRoot, "events", "2026");
    await mkdir(eventRoot, { recursive: true });
    const rows = Array.from({ length: 250 }, (_, index) => JSON.stringify({
      entry_id: `event_${index}`,
      occurred_at: new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString(),
      summary: `event ${index}`,
    }));
    await writeFile(path.join(eventRoot, "2026-01.jsonl"), `${rows.join("\n")}\n`, "utf8");

    const events = await readRecentActivityEvents({ activityRoot, limit: 250 });
    assert.equal(events.length, 250);
    assert.equal(events[0].entry_id, "event_249");
    assert.equal((await readRecentActivityEvents({ activityRoot, limit: 251 })).length, 250);
    rows.push(JSON.stringify({
      entry_id: "event_250",
      occurred_at: new Date(Date.UTC(2026, 0, 1, 4, 10)).toISOString(),
      summary: "event 250",
    }));
    await writeFile(path.join(eventRoot, "2026-01.jsonl"), `${rows.join("\n")}\n`, "utf8");
    assert.equal((await readRecentActivityEvents({ activityRoot, limit: 251 })).length, 251);
  } finally {
    await rm(activityRoot, { recursive: true, force: true });
  }
});

test("projectMailCandidatesToActivity writes body-safe pending candidate activity", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-mail-candidate-activity-"));
  const activityRoot = path.join(repoRoot, "guild_hall", "state", "operations", "soulforge_activity");
  const queueRoot = path.join(repoRoot, "guild_hall", "state", "gateway", "mail_candidate");

  try {
    await writeNodeIdentity(repoRoot);
    await writeMailCandidate(queueRoot, {
      candidate_id: "mail_candidate_hiworks_evt_001",
      status: "pending_review",
      source_event: {
        event_id: "evt_001",
        source: "hiworks",
        workspace: "company",
        event_file: "guild_hall/state/gateway/mailbox/company/mail/events/hiworks/2026/2026-05.jsonl",
        received_at: "2026-05-11T09:10:00+09:00",
        ingested_at: "2026-05-11T00:10:02Z",
      },
      mail_summary: {
        subject: "PDR package review request",
        from: [{ name: "Requester", address: "requester@example.test" }],
        to_count: 1,
        cc_count: 0,
        attachment_count: 2,
        attachment_types: ["file"],
        classification: { bucket: "mail", reasons: ["fresh_mail_event"] },
      },
      raw_body: "<html><body>must not project</body></html>",
      attachment_url: "https://example.test/secret.pdf",
    });

    const result = await projectMailCandidatesToActivity({
      repoRoot,
      activityRoot,
      queueRoot,
      now: new Date("2026-05-11T00:20:00.000Z"),
    });

    assert.equal(result.projected, 1);
    assert.equal(result.skipped_unchanged, 0);
    const rows = await readMonthlyRows(activityRoot, "2026", "2026-05");
    assert.equal(rows.length, 1);
    assert.equal(rows[0].entry_id, "mail_candidate:mail_candidate_hiworks_evt_001");
    assert.equal(rows[0].scope, "gateway");
    assert.equal(rows[0].action, "mail_candidate_summary");
    assert.equal(rows[0].result, "pending_review");
    assert.equal(rows[0].carry_forward, true);
    assert.equal(rows[0].summary.includes("PDR package review request"), true);
    assert.equal(rows[0].summary.includes("Requester"), true);
    assert.equal(JSON.stringify(rows[0]).includes("must not project"), false);
    assert.equal(JSON.stringify(rows[0]).includes("secret.pdf"), false);

    const second = await projectMailCandidatesToActivity({
      repoRoot,
      activityRoot,
      queueRoot,
      now: new Date("2026-05-11T01:20:00.000Z"),
    });
    assert.equal(second.projected, 0);
    assert.equal(second.skipped_unchanged, 1);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("projectMailCandidatesToActivity closes carry-forward when candidate is no longer pending", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-mail-candidate-closed-"));
  const activityRoot = path.join(repoRoot, "guild_hall", "state", "operations", "soulforge_activity");
  const queueRoot = path.join(repoRoot, "guild_hall", "state", "gateway", "mail_candidate");

  try {
    await writeMailCandidate(queueRoot, {
      candidate_id: "mail_candidate_hiworks_evt_002",
      status: "pending_review",
      source_event: {
        received_at: "2026-05-11T09:10:00+09:00",
      },
      mail_summary: {
        subject: "Design review request",
        from: [{ address: "owner@example.test" }],
        attachment_count: 0,
      },
    });
    await projectMailCandidatesToActivity({
      repoRoot,
      activityRoot,
      queueRoot,
      now: new Date("2026-05-11T00:20:00.000Z"),
    });

    await writeMailCandidate(queueRoot, {
      candidate_id: "mail_candidate_hiworks_evt_002",
      status: "promoted_to_intake_request",
      source_event: {
        received_at: "2026-05-11T09:10:00+09:00",
      },
      mail_summary: {
        subject: "Design review request",
        from: [{ address: "owner@example.test" }],
        attachment_count: 0,
      },
      business_review: {
        intake_request_status: "created",
      },
    });
    const result = await projectMailCandidatesToActivity({
      repoRoot,
      activityRoot,
      queueRoot,
      now: new Date("2026-05-11T01:20:00.000Z"),
    });

    assert.equal(result.projected, 1);
    const rows = await readMonthlyRows(activityRoot, "2026", "2026-05");
    assert.equal(rows.length, 2);
    assert.equal(rows[1].entry_id, rows[0].entry_id);
    assert.equal(rows[1].result, "promoted_to_intake_request");
    assert.equal(rows[1].carry_forward, false);

    const latest = JSON.parse(await readFile(path.join(activityRoot, "latest_context.json"), "utf8"));
    assert.equal(latest.open_threads.some((entry) => entry.entry_id === "mail_candidate:mail_candidate_hiworks_evt_002"), false);
    assert.equal(latest.recent_entries[0].result, "promoted_to_intake_request");
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
          asset_usage: {
            schema_version: "soulforge.custom_asset_usage.v0",
            asset_type: "workflow",
            asset_id: "example_v0",
            asset_ref: ".workflow/example_v0/workflow.yaml",
            maintenance_owner: ".workflow",
            baseline_ref: "docs/architecture/workspace/examples/example.json",
            outcome_evidence_ref: "guild_hall/state/operations/example.json",
            fallback_ref: ".workflow/fallback_v0/workflow.yaml",
            lifecycle_policy_ref: "docs/architecture/guild_hall/CUSTOM_ASSET_USAGE_LIFECYCLE_V0.md",
          },
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
    assert.equal(privateRaw.includes('"asset_usage"'), true);

    const latest = JSON.parse(await readFile(path.join(activityRoot, "latest_context.json"), "utf8"));
    assert.equal(JSON.stringify(latest).includes("raw_body"), false);
    assert.equal(JSON.stringify(latest).includes("abc1234567890"), false);
    assert.equal(latest.recent_entries[0].asset_usage.asset_id, "example_v0");
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

test("mergeActivitySurfaces does not mirror markdown log reports", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-activity-sync-log-boundary-"));
  const activityRoot = path.join(repoRoot, "guild_hall", "state", "operations", "soulforge_activity");
  const privateActivityRoot = path.join(repoRoot, "private-state", "guild_hall", "state", "operations", "soulforge_activity");
  const localLogRelative = path.join("log", "2026", "2026-05-08", "0100-local.md");
  const privateLogRelative = path.join("log", "2026", "2026-05-08", "0200-private.md");

  try {
    await mkdir(path.dirname(path.join(activityRoot, localLogRelative)), { recursive: true });
    await mkdir(path.dirname(path.join(privateActivityRoot, privateLogRelative)), { recursive: true });
    await writeFile(path.join(activityRoot, localLogRelative), "raw_body: local report fixture", "utf8");
    await writeFile(path.join(privateActivityRoot, privateLogRelative), "raw_body: private report fixture", "utf8");

    const merge = await mergeActivitySurfaces({
      activityRoot,
      privateActivityRoot,
      now: new Date("2026-05-08T03:00:00.000Z"),
    });

    assert.equal(merge.added_to_local, 0);
    assert.equal(merge.added_to_private, 0);
    assert.equal(await fileExists(path.join(privateActivityRoot, localLogRelative)), false);
    assert.equal(await fileExists(path.join(activityRoot, privateLogRelative)), false);
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
        if (args.join(" ") === "remote") {
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

test("syncActivityToPrivateState skips commit and push when private-state stays clean", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-activity-sync-clean-"));
  const privateStateRoot = path.join(repoRoot, "private-state");
  const commands = [];

  try {
    await mkdir(path.join(privateStateRoot, ".git"), { recursive: true });
    const result = await syncActivityToPrivateState({
      repoRoot,
      privateStateRoot,
      runCommand: async ({ args }) => {
        const command = args.join(" ");
        commands.push(command);
        if (command === "status --porcelain") {
          return { ok: true, status: 0, stdout: "", stderr: "" };
        }
        if (command === "branch --show-current") {
          return { ok: true, status: 0, stdout: "main\n", stderr: "" };
        }
        if (command === "remote") {
          return { ok: true, status: 0, stdout: "origin\n", stderr: "" };
        }
        if (command === "pull --ff-only origin main") {
          return { ok: true, status: 0, stdout: "Already up to date.\n", stderr: "" };
        }
        throw new Error(`unexpected command: git ${command}`);
      },
    });

    assert.equal(result.status, "completed");
    assert.equal(result.reason, "activity_already_current");
    assert.equal(result.private_state.committed, false);
    assert.equal(result.private_state.pushed, false);
    assert.deepEqual(commands, [
      "status --porcelain",
      "branch --show-current",
      "remote",
      "pull --ff-only origin main",
      "status --porcelain",
    ]);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("syncActivityToPrivateState commits and pushes only the activity surface when changed", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-activity-sync-changed-"));
  const privateStateRoot = path.join(repoRoot, "private-state");
  const commands = [];
  let statusCalls = 0;

  try {
    await mkdir(path.join(privateStateRoot, ".git"), { recursive: true });
    const result = await syncActivityToPrivateState({
      repoRoot,
      privateStateRoot,
      runCommand: async ({ args }) => {
        const command = args.join(" ");
        commands.push(command);
        if (command === "status --porcelain") {
          statusCalls += 1;
          return {
            ok: true,
            status: 0,
            stdout: statusCalls === 1 ? "" : " M guild_hall/state/operations/soulforge_activity/latest_context.json\n",
            stderr: "",
          };
        }
        if (command === "branch --show-current") {
          return { ok: true, status: 0, stdout: "main\n", stderr: "" };
        }
        if (command === "remote") {
          return { ok: true, status: 0, stdout: "origin\n", stderr: "" };
        }
        if (command === "pull --ff-only origin main") {
          return { ok: true, status: 0, stdout: "Already up to date.\n", stderr: "" };
        }
        if (command === "add guild_hall/state/operations/soulforge_activity") {
          return { ok: true, status: 0, stdout: "", stderr: "" };
        }
        if (command === "commit -m chore: sync activity context") {
          return { ok: true, status: 0, stdout: "[main abc1234] chore: sync activity context\n", stderr: "" };
        }
        if (command === "rev-parse HEAD") {
          return { ok: true, status: 0, stdout: "abc1234\n", stderr: "" };
        }
        if (command === "push origin HEAD:main") {
          return { ok: true, status: 0, stdout: "", stderr: "" };
        }
        throw new Error(`unexpected command: git ${command}`);
      },
    });

    assert.equal(result.status, "completed");
    assert.equal(result.reason, "activity_synced");
    assert.equal(result.private_state.committed, true);
    assert.equal(result.private_state.pushed, true);
    assert.equal(result.private_state.commit_oid, "abc1234");
    assert.deepEqual(commands, [
      "status --porcelain",
      "branch --show-current",
      "remote",
      "pull --ff-only origin main",
      "status --porcelain",
      "add guild_hall/state/operations/soulforge_activity",
      "commit -m chore: sync activity context",
      "rev-parse HEAD",
      "push origin HEAD:main",
    ]);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("syncActivityToPrivateState suppresses raw git output in JSON-safe steps", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-activity-sync-redact-"));
  const privateStateRoot = path.join(repoRoot, "private-state");

  try {
    await mkdir(path.join(privateStateRoot, ".git"), { recursive: true });
    const result = await syncActivityToPrivateState({
      repoRoot,
      privateStateRoot,
      runCommand: async ({ args }) => {
        const command = args.join(" ");
        if (command === "status --porcelain") {
          return { ok: true, status: 0, stdout: "", stderr: "" };
        }
        if (command === "branch --show-current") {
          return { ok: true, status: 0, stdout: "main\n", stderr: "" };
        }
        if (command === "remote") {
          return { ok: true, status: 0, stdout: "origin\n", stderr: "" };
        }
        if (command === "pull --ff-only origin main") {
          return {
            ok: false,
            status: 1,
            stdout: "",
            stderr: "fatal: could not read from https://user:credential-token@example.test/private-state.git\n",
          };
        }
        throw new Error(`unexpected command: git ${command}`);
      },
    });

    const payload = JSON.stringify(result);
    assert.equal(result.status, "blocked");
    assert.equal(result.reason, "private_state_pull_failed");
    assert.equal(payload.includes("credential-token"), false);
    assert.equal(payload.includes("example.test"), false);
    assert.equal(payload.includes("private-state.git"), false);
    assert.equal(result.steps.at(-1).summary, "failed");
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

async function fileExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
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

async function writeMailCandidate(queueRoot, overrides = {}) {
  const pendingRoot = path.join(queueRoot, "queue", "pending");
  await mkdir(pendingRoot, { recursive: true });
  const candidate = {
    schema_version: "mail_candidate.queue_item.v1",
    candidate_id: "mail_candidate_demo",
    status: "pending_review",
    created_at: "2026-05-11T00:00:00Z",
    updated_at: "2026-05-11T00:00:00Z",
    created_by: "gateway_mail_fetch",
    review_reason: "fresh_mail_event",
    source_event: {},
    mail_summary: {},
    business_review: {},
    ...overrides,
  };
  await writeFile(
    path.join(pendingRoot, `${candidate.candidate_id}.json`),
    `${JSON.stringify(candidate, null, 2)}\n`,
    "utf8",
  );
}

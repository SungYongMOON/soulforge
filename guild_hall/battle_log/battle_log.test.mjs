import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  appendBattleEvent,
  buildSyntheticBattleEvent,
  renderBattleLog,
} from "./battle_log.mjs";

test("appendBattleEvent writes project-local JSONL, daily markdown, and latest markdown", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-battle-log-"));
  const workmetaRoot = path.join(repoRoot, "_workmeta");

  try {
    const result = await appendBattleEvent({
      repoRoot,
      workmetaRoot,
      input: buildSyntheticBattleEvent({
        event_id: "battle-2026-03-19-0001",
        project_code: "demo_project",
        source_ref: "synthetic-mail-2026-03-19-001",
        next_action_note: "status deck refresh draft review",
        dungeon: "display-only-value",
      }),
    });

    assert.equal(
      result.events_path,
      path.join(workmetaRoot, "demo_project", "log", "events", "2026", "03", "battle_events.jsonl"),
    );
    assert.equal(
      result.daily_path,
      path.join(workmetaRoot, "demo_project", "log", "battle_log", "daily", "2026-03-19.md"),
    );
    assert.equal(result.latest_path, path.join(workmetaRoot, "demo_project", "log", "battle_log", "latest.md"));

    const rows = (await readFile(result.events_path, "utf8")).trim().split("\n").map((line) => JSON.parse(line));
    assert.equal(rows.length, 1);
    assert.equal(rows[0].event_id, "battle-2026-03-19-0001");
    assert.equal(rows[0].project_code, "demo_project");
    assert.equal(rows[0].source_ref, "synthetic-mail-2026-03-19-001");
    assert.equal(Object.hasOwn(rows[0], "dungeon"), false);

    const daily = await readFile(result.daily_path, "utf8");
    assert.match(daily, /# Battle Log Daily - demo_project - 2026-03-19/u);
    assert.match(daily, /Event count: 1/u);
    assert.match(daily, /completed_with_follow_up/u);
    assert.match(daily, /status deck refresh draft review/u);

    const latest = await readFile(result.latest_path, "utf8");
    assert.match(latest, /# Battle Log Latest - demo_project/u);
    assert.match(latest, /Event count: 1/u);
    assert.match(latest, /synthetic-mail-2026-03-19-001/u);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("appendBattleEvent can generate the next date-scoped event id", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-battle-log-id-"));
  const workmetaRoot = path.join(repoRoot, "_workmeta");

  try {
    await appendBattleEvent({
      repoRoot,
      workmetaRoot,
      input: buildSyntheticBattleEvent({
        event_id: "battle-2026-03-19-0001",
        project_code: "demo_project",
      }),
    });
    const second = await appendBattleEvent({
      repoRoot,
      workmetaRoot,
      input: buildSyntheticBattleEvent({
        event_id: undefined,
        project_code: "demo_project",
        occurred_at: "2026-03-19T10:00:00+09:00",
        source_ref: "synthetic-mail-2026-03-19-002",
        bottleneck_reason: "none",
        intervention_count: 0,
        result: "completed",
      }),
    });

    assert.equal(second.event.event_id, "battle-2026-03-19-0002");
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("renderBattleLog rebuilds daily and latest surfaces from the event stream", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-battle-log-render-"));
  const workmetaRoot = path.join(repoRoot, "_workmeta");

  try {
    await appendBattleEvent({
      repoRoot,
      workmetaRoot,
      input: buildSyntheticBattleEvent({
        event_id: "battle-2026-03-19-0001",
        project_code: "demo_project",
        occurred_at: "2026-03-19T08:40:00+09:00",
      }),
    });
    await appendBattleEvent({
      repoRoot,
      workmetaRoot,
      input: buildSyntheticBattleEvent({
        event_id: "battle-2026-03-20-0001",
        project_code: "demo_project",
        occurred_at: "2026-03-20T11:20:00+09:00",
        mission_id: "newer_mission",
        source_ref: "manual-close-2026-03-20-001",
        source_kind: "manual",
        result: "completed",
        intervention_count: 0,
        bottleneck_reason: "none",
        next_action_note: "",
      }),
    });

    const result = await renderBattleLog({
      repoRoot,
      workmetaRoot,
      projectCode: "demo_project",
      date: "2026-03-19",
      latestCount: 2,
    });
    const daily = await readFile(result.daily_path, "utf8");
    const latest = await readFile(result.latest_path, "utf8");

    assert.match(daily, /Event count: 1/u);
    assert.equal(daily.includes("newer_mission"), false);
    assert.ok(latest.indexOf("newer_mission") < latest.indexOf("author_pptx_autofill_conversion_001"));
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("appendBattleEvent rejects raw payload keys and unsafe project paths", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-battle-log-boundary-"));
  const workmetaRoot = path.join(repoRoot, "_workmeta");

  try {
    await assert.rejects(
      appendBattleEvent({
        repoRoot,
        workmetaRoot,
        input: {
          ...buildSyntheticBattleEvent({ project_code: "demo_project" }),
          raw_body: "<html><body>do not persist</body></html>",
        },
      }),
      /unsafe_battle_event_payload_key/u,
    );
    await assert.rejects(
      appendBattleEvent({
        repoRoot,
        workmetaRoot,
        input: buildSyntheticBattleEvent({ project_code: "../private-state" }),
      }),
      /invalid_project_code/u,
    );
    await assert.rejects(
      appendBattleEvent({
        repoRoot,
        workmetaRoot,
        input: buildSyntheticBattleEvent({
          project_code: "demo_project",
          source_kind: "mail",
          source_ref: "https://example.test/raw-mail?id=1",
        }),
      }),
      /unsafe_battle_event_source_ref/u,
    );
    await assert.rejects(
      renderBattleLog({
        repoRoot,
        workmetaRoot,
        projectCode: "demo_project",
        date: "../../2026-03-19",
      }),
      /invalid_battle_log_date/u,
    );
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("cli append writes through the same project-local surfaces", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-battle-log-cli-"));
  const workmetaRoot = path.join(repoRoot, "_workmeta");
  const eventPath = path.join(repoRoot, "event.json");

  try {
    await writeFile(
      eventPath,
      `${JSON.stringify(
        buildSyntheticBattleEvent({
          event_id: "battle-2026-03-21-0001",
          project_code: "demo_project",
          occurred_at: "2026-03-21T09:00:00+09:00",
          source_ref: "manual-cli-smoke-001",
          source_kind: "manual",
          result: "completed",
          intervention_count: 0,
          bottleneck_reason: "none",
        }),
        null,
        2,
      )}\n`,
      "utf8",
    );

    const cliPath = new URL("./cli.mjs", import.meta.url).pathname;
    const run = spawnSync(
      process.execPath,
      [cliPath, "append", "--workmeta-root", workmetaRoot, "--event-file", eventPath, "--json"],
      { encoding: "utf8" },
    );

    assert.equal(run.status, 0, run.stderr);
    const payload = JSON.parse(run.stdout);
    assert.equal(payload.status, "appended");
    assert.equal(payload.event_id, "battle-2026-03-21-0001");
    assert.match(await readFile(payload.latest_path, "utf8"), /manual-cli-smoke-001/u);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

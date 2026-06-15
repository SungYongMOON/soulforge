import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  buildMorningReport,
  renderMorningReportMarkdown,
  writeMorningReport,
} from "./morning_report.mjs";

const MORNING_REPORT_CLI = path.relative(process.cwd(), fileURLToPath(new URL("./morning_report.mjs", import.meta.url)));

test("writeMorningReport writes project-local daily and latest briefings", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-morning-report-"));
  const workmetaRoot = path.join(repoRoot, "_workmeta");

  try {
    await writeMissionSurfaces(repoRoot);
    await writeBattleLog({
      workmetaRoot,
      projectCode: "demo_project",
      date: "2026-05-17",
      body: [
        "# Battle Log Daily - demo_project - 2026-05-17",
        "",
        "- Schema: `soulforge.workspace.battle_event.v0`",
        "- Event count: 2",
        "- Results: completed=1, blocked=1",
        "- Interventions: 1",
        "- Bottlenecks: human_confirmation_required=1",
        "",
        "| Time | Mission | Stage | Party / Unit | Mode | Result | Interventions | Source | Next action |",
        "| --- | --- | --- | --- | --- | --- | ---: | --- | --- |",
        "| 2026-05-17 08:40 | mission_blocked | kickoff alignment | guild_master_cell / guild_master | manual_assist | blocked | 1 | manual:synthetic-note-001 | Owner confirms workflow. |",
        "| 2026-05-17 09:20 | mission_done | closure | guild_master_cell / guild_master | manual | completed | 0 | manual:synthetic-note-002 | No follow-up. |",
        "",
      ].join("\n"),
    });

    const result = await writeMorningReport({
      repoRoot,
      workmetaRoot,
      projectCode: "demo_project",
      date: "2026-05-17",
      generatedAt: new Date("2026-05-17T00:00:00.000Z"),
    });

    assert.equal(
      result.daily_path,
      path.join(workmetaRoot, "demo_project", "reports", "morning_report", "2026-05-17.md"),
    );
    assert.equal(result.latest_path, path.join(workmetaRoot, "demo_project", "reports", "morning_report", "latest.md"));
    assert.equal(result.report.summary.blocked_mission_count, 1);
    assert.equal(result.report.summary.completed_mission_count, 1);
    assert.equal(result.report.summary.red_flag_count, 2);
    assert.equal(result.report.battle_ledger.daily_event_count, 2);

    const daily = await readFile(result.daily_path, "utf8");
    const latest = await readFile(result.latest_path, "utf8");
    assert.equal(latest, daily);
    assert.match(daily, /# Morning Project Report - demo_project - 2026-05-17/u);
    assert.match(daily, /Mission Review Needed/u);
    assert.match(daily, /mission_blocked/u);
    assert.match(daily, /missing_owner_boundary/u);
    assert.match(daily, /Owner confirms workflow/u);
    assert.match(daily, /ui:done:check/u);
    assert.doesNotMatch(daily, /<html|Bearer|password/u);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("buildMorningReport reads the contract fallback battle log path", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-morning-report-fallback-"));
  const workmetaRoot = path.join(repoRoot, "_workmeta");

  try {
    await writeMissionSurfaces(repoRoot);
    const fallbackRoot = path.join(workmetaRoot, "demo_project", "log", "battle_log");
    await mkdir(fallbackRoot, { recursive: true });
    await writeFile(
      path.join(fallbackRoot, "2026-05-17.md"),
      [
        "# Battle Log Daily - demo_project - 2026-05-17",
        "",
        "- Event count: 0",
        "- Results: none",
        "- Bottlenecks: none",
        "",
        "_No battle events recorded._",
        "",
      ].join("\n"),
      "utf8",
    );

    const report = await buildMorningReport({
      repoRoot,
      workmetaRoot,
      projectCode: "demo_project",
      date: "2026-05-17",
      generatedAt: new Date("2026-05-17T00:00:00.000Z"),
    });

    assert.equal(report.source_refs.battle_log_daily, "_workmeta/demo_project/log/battle_log/2026-05-17.md");
    assert.equal(report.battle_ledger.daily_event_count, 0);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("buildMorningReport can use private workmeta mission surfaces instead of the public mission index", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-morning-report-private-"));
  const workmetaRoot = path.join(repoRoot, "_workmeta");

  try {
    await writeMissionSurfaces(repoRoot);
    await writePrivateMissionSurface({
      workmetaRoot,
      projectCode: "demo_project",
      missionId: "private_blocked",
      missionYaml: [
        "mission_id: private_blocked",
        "title: Private Blocked Mission",
        "status: active",
        "workflow_id: null",
        "project_code: demo_project",
        "mission_level: private_current",
        "",
      ].join("\n"),
      readinessYaml: [
        "mission_id: private_blocked",
        "status: blocked",
        "promotion_review_needed: true",
        "blockers:",
        "  - owner confirmation required",
        "",
      ].join("\n"),
    });
    await writeBattleLog({
      workmetaRoot,
      projectCode: "demo_project",
      date: "2026-05-17",
      body: [
        "# Battle Log Daily - demo_project - 2026-05-17",
        "",
        "- Event count: 0",
        "- Results: none",
        "- Bottlenecks: none",
        "",
      ].join("\n"),
    });

    const report = await buildMorningReport({
      repoRoot,
      workmetaRoot,
      projectCode: "demo_project",
      date: "2026-05-17",
      generatedAt: new Date("2026-05-17T00:00:00.000Z"),
    });
    const markdown = renderMorningReportMarkdown(report);

    assert.equal(report.source_refs.mission_source_type, "private_workmeta");
    assert.equal(report.source_refs.mission_index, null);
    assert.equal(report.source_refs.mission_root, "_workmeta/demo_project/missions/");
    assert.deepEqual(report.source_refs.mission_surfaces, ["_workmeta/demo_project/missions/private_blocked/"]);
    assert.deepEqual(report.missions.map((mission) => mission.mission_id), ["private_blocked"]);
    assert.equal(report.summary.blocked_mission_count, 1);
    assert.match(markdown, /Mission source: `private_workmeta`/u);
    assert.match(markdown, /_workmeta\/demo_project\/missions\/private_blocked\//u);
    assert.doesNotMatch(markdown, new RegExp(escapeRegExp(repoRoot), "u"));
    assert.doesNotMatch(markdown, /\.mission\/mission_blocked/u);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("buildMorningReport validates private mission metadata before report generation", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-morning-report-private-validation-"));
  const workmetaRoot = path.join(repoRoot, "_workmeta");

  try {
    await writePrivateMissionSurface({
      workmetaRoot,
      projectCode: "demo_project",
      missionId: "private_bad",
      missionYaml: [
        "mission_id: private_bad",
        "status: active",
        "project_code: other_project",
        "",
      ].join("\n"),
      readinessYaml: [
        "mission_id: private_bad",
        "status: active",
        "",
      ].join("\n"),
    });

    await assert.rejects(
      buildMorningReport({
        repoRoot,
        workmetaRoot,
        projectCode: "demo_project",
        date: "2026-05-17",
      }),
      /private_mission_project_code_mismatch/u,
    );

    await rm(path.join(workmetaRoot, "demo_project", "missions", "private_bad"), { recursive: true, force: true });
    await writePrivateMissionSurface({
      workmetaRoot,
      projectCode: "demo_project",
      missionId: "private_raw",
      missionYaml: [
        "mission_id: private_raw",
        "status: active",
        "project_code: demo_project",
        "summary: Bearer abcdefghijklmnop",
        "",
      ].join("\n"),
      readinessYaml: [
        "mission_id: private_raw",
        "status: active",
        "",
      ].join("\n"),
    });

    await assert.rejects(
      buildMorningReport({
        repoRoot,
        workmetaRoot,
        projectCode: "demo_project",
        date: "2026-05-17",
      }),
      /unsafe_morning_report_text: private_mission_surface/u,
    );
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("morning report rejects unsafe project paths and raw battle-log payloads", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-morning-report-boundary-"));
  const workmetaRoot = path.join(repoRoot, "_workmeta");

  try {
    await writeMissionSurfaces(repoRoot);
    await assert.rejects(
      buildMorningReport({
        repoRoot,
        workmetaRoot,
        projectCode: "../private-state",
        date: "2026-05-17",
      }),
      /invalid_project_code/u,
    );

    await writeBattleLog({
      workmetaRoot,
      projectCode: "demo_project",
      date: "2026-05-17",
      body: [
        "# Battle Log Daily - demo_project - 2026-05-17",
        "",
        "- Event count: 1",
        "- Results: blocked=1",
        "- Bottlenecks: secret_or_private_gate=1",
        "",
        "| Time | Mission | Stage | Party / Unit | Mode | Result | Interventions | Source | Next action |",
        "| --- | --- | --- | --- | --- | --- | ---: | --- | --- |",
        "| 2026-05-17 08:40 | mission_blocked | raw intake | guild_master_cell / guild_master | manual | blocked | 1 | mail:https://example.test/raw?id=1 | <html><body>raw</body></html> |",
        "",
      ].join("\n"),
    });

    await assert.rejects(
      buildMorningReport({
        repoRoot,
        workmetaRoot,
        projectCode: "demo_project",
        date: "2026-05-17",
      }),
      /unsafe_morning_report_text|unsafe_morning_report_source_ref/u,
    );
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("morning report rejects malformed or unsafe battle-log source cells without echoing values", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-morning-report-source-ref-"));
  const workmetaRoot = path.join(repoRoot, "_workmeta");
  const unsafeSources = [
    "synthetic-note-001",
    ":synthetic-note-001",
    "manual:",
    "manual:synthetic:note-001",
    "unknown:synthetic-note-001",
    "other:synthetic-note-001",
    "manual:https://example.test/raw?id=1",
    "manual:file:" + "/" + "/" + "/" + "synthetic-note-001",
    "manual:synthetic-note-001?token=fake-token-001",
    "manual:session-token-001",
    "manual:" + "/" + "synthetic-root/synthetic-note-001",
    "manual:C:/Users/synthetic-note-001",
    "manual:../synthetic-note-001",
    "manual:folder/../synthetic-note-001",
    "manual:private-raw-source-payload-001",
    "manual:source_text_chunk_001",
  ];

  try {
    await writeMissionSurfaces(repoRoot);

    for (const source of unsafeSources) {
      await writeBattleLog({
        workmetaRoot,
        projectCode: "demo_project",
        date: "2026-05-17",
        body: battleLogBodyWithSource(source),
      });

      await assert.rejects(
        buildMorningReport({
          repoRoot,
          workmetaRoot,
          projectCode: "demo_project",
          date: "2026-05-17",
        }),
        (error) => {
          const message = String(error?.message ?? "");
          const output = String(error?.stack ?? message);
          assert.match(message, /unsafe_morning_report_text|unsafe_morning_report_source_ref/u);
          assert.doesNotMatch(output, new RegExp(escapeRegExp(source), "u"));
          return true;
        },
      );
    }
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("cli rejects unsafe battle-log source refs without writing the source value to stdout", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-morning-report-cli-source-ref-"));
  const workmetaRoot = path.join(repoRoot, "_workmeta");
  const unsafeSource = "manual:../synthetic-note-001";

  try {
    await writeMissionSurfaces(repoRoot);
    await writeBattleLog({
      workmetaRoot,
      projectCode: "demo_project",
      date: "2026-05-17",
      body: battleLogBodyWithSource(unsafeSource),
    });

    const run = spawnSync(
      process.execPath,
      [
        MORNING_REPORT_CLI,
        "--repo-root",
        repoRoot,
        "--workmeta-root",
        workmetaRoot,
        "--project-code",
        "demo_project",
        "--date",
        "2026-05-17",
        "--json",
      ],
      { encoding: "utf8" },
    );

    assert.notEqual(run.status, 0);
    assert.equal(run.stdout, "");
    assert.match(run.stderr, /unsafe_morning_report_source_ref/u);
    assert.doesNotMatch(run.stderr, new RegExp(escapeRegExp(unsafeSource), "u"));
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("renderMorningReportMarkdown includes required contract sections", () => {
  const markdown = renderMorningReportMarkdown({
    schema_version: "soulforge.morning_project_report.v0",
    report_date: "2026-05-17",
    project_code: "demo_project",
    generated_at: "2026-05-17T00:00:00.000Z",
    generated_by: "nightly_sweep_v0",
    source_refs: {
      mission_index: ".mission/index.yaml",
      battle_log_daily: "_workmeta/demo_project/log/battle_log/daily/2026-05-17.md",
      battle_log_latest: "_workmeta/demo_project/log/battle_log/latest.md",
    },
    summary: {
      active_mission_count: 1,
      blocked_mission_count: 1,
      completed_mission_count: 1,
      red_flag_count: 1,
      workspace_boundary_status: "not_recorded",
      owner_boundary_status: "not_recorded",
      docs_link_status: "not_recorded",
      contract_status: "not_recorded",
    },
    missions: [
      {
        mission_id: "mission_blocked",
        current_status: "blocked",
        blocker_kind: "human_confirmation_required",
        mission_level_hint: "blocked_sample_or_current_default_review",
        promotion_review_needed: true,
      },
    ],
    checks: [
      {
        name: "ui:validate",
        result: "passed",
        check_bucket: "core_nightly",
        short_note: "validated",
      },
    ],
    battle_ledger: {
      daily_event_count: 0,
      result_counts: {},
      bottleneck_counts: {},
      events: [],
    },
    top_actions: ["Review blocked mission `mission_blocked`."],
    notes: ["local only"],
  });

  for (const section of [
    "Executive Snapshot",
    "Mission Review Needed",
    "Code Health",
    "Boundary And Docs Health",
    "Battle Ledger",
    "Promotion Review Hints",
    "Today Actions",
  ]) {
    assert.match(markdown, new RegExp(section, "u"));
  }
});

test("cli writes the project-local report", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-morning-report-cli-"));
  const workmetaRoot = path.join(repoRoot, "_workmeta");

  try {
    await writeMissionSurfaces(repoRoot);
    await writeBattleLog({
      workmetaRoot,
      projectCode: "demo_project",
      date: "2026-05-17",
      body: [
        "# Battle Log Daily - demo_project - 2026-05-17",
        "",
        "- Event count: 0",
        "- Results: none",
        "- Bottlenecks: none",
        "",
      ].join("\n"),
    });

    const run = spawnSync(
      process.execPath,
      [
        MORNING_REPORT_CLI,
        "--repo-root",
        repoRoot,
        "--workmeta-root",
        workmetaRoot,
        "--project-code",
        "demo_project",
        "--date",
        "2026-05-17",
        "--json",
      ],
      { encoding: "utf8" },
    );

    assert.equal(run.status, 0, run.stderr);
    const payload = JSON.parse(run.stdout);
    assert.equal(payload.status, "written");
    assert.match(await readFile(payload.daily_path, "utf8"), /Morning Project Report/u);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

async function writeMissionSurfaces(repoRoot) {
  const missionRoot = path.join(repoRoot, ".mission");
  await mkdir(path.join(missionRoot, "mission_blocked"), { recursive: true });
  await mkdir(path.join(missionRoot, "mission_done"), { recursive: true });
  await writeFile(
    path.join(missionRoot, "index.yaml"),
    [
      "version: v1",
      "entries:",
      "  - mission_id: mission_blocked",
      "    title: Blocked Mission",
      "    status: blocked",
      "    workflow_id: null",
      "    project_code: demo_project",
      "    readiness_status: blocked",
      "  - mission_id: mission_done",
      "    title: Done Mission",
      "    status: completed",
      "    workflow_id: author_skill_package",
      "    project_code: demo_project",
      "    readiness_status: completed",
      "  - mission_id: other_project_mission",
      "    title: Other Project",
      "    status: blocked",
      "    project_code: other_project",
      "    readiness_status: blocked",
      "",
    ].join("\n"),
    "utf8",
  );
  await writeFile(
    path.join(missionRoot, "mission_blocked", "mission.yaml"),
    [
      "mission_id: mission_blocked",
      "status: blocked",
      "workflow_id: null",
      "project_code: demo_project",
      "",
    ].join("\n"),
    "utf8",
  );
  await writeFile(
    path.join(missionRoot, "mission_blocked", "readiness.yaml"),
    [
      "mission_id: mission_blocked",
      "status: blocked",
      "checks:",
      "  workflow_present: missing",
      "blockers:",
      "  - workflow_id is not yet resolved.",
      "",
    ].join("\n"),
    "utf8",
  );
  await writeFile(
    path.join(missionRoot, "mission_done", "readiness.yaml"),
    [
      "mission_id: mission_done",
      "status: completed",
      "blockers: []",
      "",
    ].join("\n"),
    "utf8",
  );
}

async function writeBattleLog({ workmetaRoot, projectCode, date, body }) {
  const logRoot = path.join(workmetaRoot, projectCode, "log", "battle_log");
  await mkdir(path.join(logRoot, "daily"), { recursive: true });
  await writeFile(path.join(logRoot, "daily", `${date}.md`), `${body.replace(/\s+$/u, "")}\n`, "utf8");
  await writeFile(path.join(logRoot, "latest.md"), `${body.replace(/\s+$/u, "")}\n`, "utf8");
}

async function writePrivateMissionSurface({ workmetaRoot, projectCode, missionId, missionYaml, readinessYaml }) {
  const missionRoot = path.join(workmetaRoot, projectCode, "missions", missionId);
  await mkdir(missionRoot, { recursive: true });
  await writeFile(path.join(missionRoot, "mission.yaml"), `${missionYaml.replace(/\s+$/u, "")}\n`, "utf8");
  await writeFile(path.join(missionRoot, "readiness.yaml"), `${readinessYaml.replace(/\s+$/u, "")}\n`, "utf8");
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function battleLogBodyWithSource(source) {
  return [
    "# Battle Log Daily - demo_project - 2026-05-17",
    "",
    "- Event count: 1",
    "- Results: blocked=1",
    "- Bottlenecks: human_confirmation_required=1",
    "",
    "| Time | Mission | Stage | Party / Unit | Mode | Result | Interventions | Source | Next action |",
    "| --- | --- | --- | --- | --- | --- | ---: | --- | --- |",
    `| 2026-05-17 08:40 | mission_blocked | source ref validation | guild_master_cell / guild_master | manual | blocked | 1 | ${source} | Owner confirms workflow. |`,
    "",
  ].join("\n");
}

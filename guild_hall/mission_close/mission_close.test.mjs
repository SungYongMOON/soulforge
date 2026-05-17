import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import YAML from "yaml";
import { appendBattleEvent, buildSyntheticBattleEvent } from "../battle_log/battle_log.mjs";
import { closeMissionFromBattleEvent } from "./mission_close.mjs";

test("closeMissionFromBattleEvent writes terminal provenance only after battle and run evidence exist", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-mission-close-"));
  const workmetaRoot = path.join(repoRoot, "_workmeta");
  const missionId = "mission_close_fixture_001";
  const runId = "mission_close_run_001";
  const battleEventId = "battle-2026-03-19-0001";

  try {
    await writeMissionFixture(repoRoot, { missionId, status: "running" });
    await mkdir(path.join(workmetaRoot, "demo_project", "runs", runId), { recursive: true });
    await appendBattleEvent({
      repoRoot,
      workmetaRoot,
      input: buildSyntheticBattleEvent({
        event_id: battleEventId,
        mission_id: missionId,
        project_code: "demo_project",
        result: "completed_with_follow_up",
      }),
    });

    const result = await closeMissionFromBattleEvent({
      repoRoot,
      workmetaRoot,
      missionId,
      runId,
      battleEventId,
      closedAt: "2026-03-19T09:12:00+09:00",
    });

    assert.equal(result.status, "closed");
    assert.equal(result.terminal_result, "completed");
    assert.equal(result.changed_files.length, 3);

    const readiness = await readYaml(path.join(repoRoot, ".mission", missionId, "readiness.yaml"));
    assert.equal(readiness.status, "completed");
    assert.equal(
      readiness.summary,
      `Mission completed via mission_close. Terminal pointers reference _workmeta/demo_project/runs/${runId} and battle event ${battleEventId}.`,
    );
    assert.equal(readiness.latest_run_id, runId);
    assert.deepEqual(readiness.blockers, []);
    assert.deepEqual(readiness.terminal_provenance, {
      closed_via: "mission_close",
      closed_at: "2026-03-19T09:12:00+09:00",
      terminal_result: "completed",
      run_id: runId,
      battle_event_id: battleEventId,
    });

    const mission = await readYaml(path.join(repoRoot, ".mission", missionId, "mission.yaml"));
    assert.equal(mission.status, "completed");
    assert.equal(mission.run_refs.latest_run_id, runId);

    const index = await readYaml(path.join(repoRoot, ".mission", "index.yaml"));
    assert.equal(index.entries[0].status, "completed");
    assert.equal(index.entries[0].readiness_status, "completed");
    assert.equal(index.entries[0].latest_run_id, runId);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("closeMissionFromBattleEvent is idempotent for the same battle provenance", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-mission-close-idempotent-"));
  const workmetaRoot = path.join(repoRoot, "_workmeta");
  const missionId = "mission_close_fixture_002";
  const runId = "mission_close_run_002";
  const battleEventId = "battle-2026-03-19-0002";
  const readinessPath = path.join(repoRoot, ".mission", missionId, "readiness.yaml");

  try {
    await writeMissionFixture(repoRoot, { missionId, status: "running" });
    await mkdir(path.join(workmetaRoot, "demo_project", "runs", runId), { recursive: true });
    await appendBattleEvent({
      repoRoot,
      workmetaRoot,
      input: buildSyntheticBattleEvent({
        event_id: battleEventId,
        mission_id: missionId,
        project_code: "demo_project",
        result: "completed",
        intervention_count: 0,
        bottleneck_reason: "none",
      }),
    });

    await closeMissionFromBattleEvent({
      repoRoot,
      workmetaRoot,
      missionId,
      runId,
      battleEventId,
      closedAt: "2026-03-19T09:12:00+09:00",
    });
    const firstReadiness = await readFile(readinessPath, "utf8");
    const second = await closeMissionFromBattleEvent({
      repoRoot,
      workmetaRoot,
      missionId,
      runId,
      battleEventId,
      closedAt: "2026-03-20T09:12:00+09:00",
    });
    const secondReadiness = await readFile(readinessPath, "utf8");

    assert.equal(second.status, "unchanged");
    assert.equal(second.changed, false);
    assert.equal(secondReadiness, firstReadiness);
    assert.match(secondReadiness, /closed_at: 2026-03-19T09:12:00\+09:00/u);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("closeMissionFromBattleEvent refuses to close without battle evidence", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-mission-close-missing-"));
  const workmetaRoot = path.join(repoRoot, "_workmeta");
  const missionId = "mission_close_fixture_003";
  const runId = "mission_close_run_003";
  const readinessPath = path.join(repoRoot, ".mission", missionId, "readiness.yaml");

  try {
    await writeMissionFixture(repoRoot, { missionId, status: "running" });
    await mkdir(path.join(workmetaRoot, "demo_project", "runs", runId), { recursive: true });
    const before = await readFile(readinessPath, "utf8");

    await assert.rejects(
      closeMissionFromBattleEvent({
        repoRoot,
        workmetaRoot,
        missionId,
        runId,
        battleEventId: "battle-2026-03-19-9999",
        closedAt: "2026-03-19T09:12:00+09:00",
      }),
      /missing_mission_close_battle_evidence/u,
    );

    assert.equal(await readFile(readinessPath, "utf8"), before);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("closeMissionFromBattleEvent targets private mission surface under workmeta", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-mission-close-private-"));
  const workmetaRoot = path.join(repoRoot, "_workmeta");
  const missionId = "mission_close_fixture_private_001";
  const runId = "mission_close_run_private_001";
  const battleEventId = "battle-2026-03-19-private-0001";
  const privateMissionRoot = path.join(workmetaRoot, "demo_project", "missions", missionId);
  const publicReadinessPath = path.join(repoRoot, ".mission", missionId, "readiness.yaml");

  try {
    await writeMissionFixture(repoRoot, { missionId, status: "running" });
    const publicReadinessBefore = await readFile(publicReadinessPath, "utf8");
    await writeMissionFixture(repoRoot, {
      missionId,
      status: "running",
      missionRoot: privateMissionRoot,
      indexPath: path.join(workmetaRoot, "demo_project", "missions", "index.yaml"),
      indexOwner: "_workmeta/demo_project/missions",
    });
    await mkdir(path.join(workmetaRoot, "demo_project", "runs", runId), { recursive: true });
    await appendBattleEvent({
      repoRoot,
      workmetaRoot,
      input: buildSyntheticBattleEvent({
        event_id: battleEventId,
        mission_id: missionId,
        project_code: "demo_project",
        result: "failed",
      }),
    });

    const result = await closeMissionFromBattleEvent({
      repoRoot,
      workmetaRoot,
      missionSurface: "private",
      projectCode: "demo_project",
      missionId,
      runId,
      battleEventId,
      closedAt: "2026-03-19T09:12:00+09:00",
    });

    assert.equal(result.status, "closed");
    assert.equal(result.mission_surface, "private");
    assert.equal(result.mission_root, privateMissionRoot);
    assert.equal(result.terminal_result, "failed");
    assert.equal(result.changed_files.length, 3);
    assert(
      result.changed_files.every((filePath) =>
        filePath.startsWith(path.join(workmetaRoot, "demo_project", "missions")),
      ),
    );

    const readiness = await readYaml(path.join(privateMissionRoot, "readiness.yaml"));
    assert.equal(readiness.status, "failed");
    assert.equal(readiness.terminal_provenance.terminal_result, "failed");
    assert.equal(readiness.terminal_provenance.run_id, runId);

    const mission = await readYaml(path.join(privateMissionRoot, "mission.yaml"));
    assert.equal(mission.status, "failed");
    assert.equal(mission.run_refs.latest_run_id, runId);

    const index = await readYaml(path.join(workmetaRoot, "demo_project", "missions", "index.yaml"));
    assert.equal(index.entries[0].status, "failed");
    assert.equal(index.entries[0].readiness_status, "failed");
    assert.equal(index.entries[0].latest_run_id, runId);
    assert.equal(await readFile(publicReadinessPath, "utf8"), publicReadinessBefore);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("closeMissionFromBattleEvent requires project code for private mission surface", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-mission-close-private-project-"));

  try {
    await assert.rejects(
      closeMissionFromBattleEvent({
        repoRoot,
        missionSurface: "private",
        missionId: "mission_close_fixture_private_002",
        runId: "mission_close_run_private_002",
        battleEventId: "battle-2026-03-19-private-0002",
        closedAt: "2026-03-19T09:12:00+09:00",
      }),
      /missing_mission_close_project_code/u,
    );
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("closeMissionFromBattleEvent rejects unsupported mission surface values", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-mission-close-surface-"));

  try {
    await assert.rejects(
      closeMissionFromBattleEvent({
        repoRoot,
        missionSurface: "shared",
        missionId: "mission_close_fixture_surface_001",
        runId: "mission_close_run_surface_001",
        battleEventId: "battle-2026-03-19-surface-0001",
        closedAt: "2026-03-19T09:12:00+09:00",
      }),
      /invalid_mission_close_mission_surface: shared/u,
    );
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("cli close uses the same evidence gate", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-mission-close-cli-"));
  const workmetaRoot = path.join(repoRoot, "_workmeta");
  const missionId = "mission_close_fixture_004";
  const runId = "mission_close_run_004";
  const battleEventId = "battle-2026-03-19-0004";

  try {
    await writeMissionFixture(repoRoot, { missionId, status: "running" });
    await mkdir(path.join(workmetaRoot, "demo_project", "runs", runId), { recursive: true });
    await appendBattleEvent({
      repoRoot,
      workmetaRoot,
      input: buildSyntheticBattleEvent({
        event_id: battleEventId,
        mission_id: missionId,
        project_code: "demo_project",
        result: "blocked",
      }),
    });

    const cliPath = new URL("./cli.mjs", import.meta.url).pathname;
    const run = spawnSync(
      process.execPath,
      [
        cliPath,
        "close",
        "--repo-root",
        repoRoot,
        "--workmeta-root",
        workmetaRoot,
        "--mission-id",
        missionId,
        "--run-id",
        runId,
        "--battle-event-id",
        battleEventId,
        "--closed-at",
        "2026-03-19T09:12:00+09:00",
        "--json",
      ],
      { encoding: "utf8" },
    );

    assert.equal(run.status, 0, run.stderr);
    const payload = JSON.parse(run.stdout);
    assert.equal(payload.status, "closed");
    assert.equal(payload.terminal_result, "blocked");
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("cli close supports the private mission surface", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-mission-close-cli-private-"));
  const workmetaRoot = path.join(repoRoot, "_workmeta");
  const missionId = "mission_close_fixture_private_003";
  const runId = "mission_close_run_private_003";
  const battleEventId = "battle-2026-03-19-private-0003";
  const privateMissionRoot = path.join(workmetaRoot, "demo_project", "missions", missionId);

  try {
    await writeMissionFixture(repoRoot, {
      missionId,
      status: "running",
      missionRoot: privateMissionRoot,
      indexPath: path.join(workmetaRoot, "demo_project", "missions", "index.yaml"),
      indexOwner: "_workmeta/demo_project/missions",
    });
    await mkdir(path.join(workmetaRoot, "demo_project", "runs", runId), { recursive: true });
    await appendBattleEvent({
      repoRoot,
      workmetaRoot,
      input: buildSyntheticBattleEvent({
        event_id: battleEventId,
        mission_id: missionId,
        project_code: "demo_project",
        result: "completed",
      }),
    });

    const cliPath = new URL("./cli.mjs", import.meta.url).pathname;
    const run = spawnSync(
      process.execPath,
      [
        cliPath,
        "close",
        "--repo-root",
        repoRoot,
        "--workmeta-root",
        workmetaRoot,
        "--mission-surface",
        "private",
        "--project-code",
        "demo_project",
        "--mission-id",
        missionId,
        "--run-id",
        runId,
        "--battle-event-id",
        battleEventId,
        "--closed-at",
        "2026-03-19T09:12:00+09:00",
        "--json",
      ],
      { encoding: "utf8" },
    );

    assert.equal(run.status, 0, run.stderr);
    const payload = JSON.parse(run.stdout);
    assert.equal(payload.status, "closed");
    assert.equal(payload.mission_surface, "private");
    assert.equal(payload.terminal_result, "completed");
    const readiness = await readYaml(path.join(privateMissionRoot, "readiness.yaml"));
    assert.equal(readiness.status, "completed");
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

async function writeMissionFixture(
  repoRoot,
  {
    missionId,
    status,
    missionRoot = path.join(repoRoot, ".mission", missionId),
    indexPath = path.join(repoRoot, ".mission", "index.yaml"),
    indexOwner = ".mission",
  },
) {
  await mkdir(missionRoot, { recursive: true });
  await writeFile(
    path.join(missionRoot, "mission.yaml"),
    YAML.stringify({
      mission_id: missionId,
      kind: "mission",
      status,
      title: "Mission Close Fixture",
      summary: "Synthetic mission close fixture.",
      project_code: "demo_project",
      workflow_id: "fixture_workflow",
      party_id: "guild_master_cell",
      run_refs: {
        latest_run_id: null,
        runtime_truth_root: "_workmeta/demo_project/runs/",
      },
    }),
    "utf8",
  );
  await writeFile(
    path.join(missionRoot, "readiness.yaml"),
    YAML.stringify({
      mission_id: missionId,
      kind: "mission_readiness",
      status,
      summary: "Synthetic mission close readiness fixture.",
      checks: {
        workflow_present: "pass",
        battle_event_persisted: "missing",
      },
      blockers: ["Battle event has not been persisted yet."],
      latest_run_id: null,
    }),
    "utf8",
  );
  await writeFile(
    indexPath,
    YAML.stringify({
      version: "v1",
      owner: indexOwner,
      kind: "mission_catalog",
      status: "active",
      entries: [
        {
          mission_id: missionId,
          title: "Mission Close Fixture",
          status,
          workflow_id: "fixture_workflow",
          party_id: "guild_master_cell",
          project_code: "demo_project",
          readiness_status: status,
        },
      ],
    }),
    "utf8",
  );
}

async function readYaml(filePath) {
  return YAML.parse(await readFile(filePath, "utf8"));
}

import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { buildSnapshot, compareSnapshotFreshness, validateSnapshot } from "./producer.mjs";

test("buildSnapshot summarizes private project surfaces without reading private content", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-snapshot-"));

  try {
    await mkdir(path.join(repoRoot, ".mission"), { recursive: true });
    await mkdir(path.join(repoRoot, "_workmeta", "PX-001", "bindings"), { recursive: true });
    await mkdir(path.join(repoRoot, "_workmeta", "PX-001", "reports", "onboarding"), { recursive: true });
    await mkdir(path.join(repoRoot, "guild_hall", "state", "gateway", "intake_inbox", "inbox_001"), { recursive: true });
    await mkdir(path.join(repoRoot, "private-state", ".git"), { recursive: true });

    await writeFile(
      path.join(repoRoot, ".mission", "index.yaml"),
      [
        "version: v1",
        "entries:",
        "  - mission_id: mission_001",
        "    title: Mission One",
        "    status: blocked",
        "    readiness_status: blocked",
        "    project_code: PX-001",
        "    party_id: guild_master_cell",
      ].join("\n"),
      "utf8",
    );
    await writeFile(path.join(repoRoot, "_workmeta", "PX-001", "contract.yaml"), "display_name: DO_NOT_LEAK_PRIVATE_NAME\n", "utf8");
    await writeFile(path.join(repoRoot, "_workmeta", "PX-001", "bindings", "mailbox_binding.yaml"), "token: DO_NOT_LEAK_TOKEN\n", "utf8");

    const snapshot = await buildSnapshot({ repoRoot, generatedAt: "2026-05-02T00:00:00.000Z" });
    const serialized = JSON.stringify(snapshot);

    assert.equal(validateSnapshot(snapshot).ok, true);
    assert.equal(snapshot.projects[0].project_code, "PX-001");
    assert.equal(snapshot.projects[0].workmeta.contract_present, true);
    assert.equal(snapshot.projects[0].workmeta.bindings_count, 1);
    assert.equal(snapshot.missions.items[0].mission_id, "mission_001");
    assert.equal(serialized.includes("DO_NOT_LEAK_PRIVATE_NAME"), false);
    assert.equal(serialized.includes("DO_NOT_LEAK_TOKEN"), false);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("compareSnapshotFreshness detects source observation changes", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-snapshot-freshness-"));
  const missionIndexPath = path.join(repoRoot, ".mission", "index.yaml");

  try {
    await mkdir(path.join(repoRoot, ".mission"), { recursive: true });
    await writeFile(
      missionIndexPath,
      [
        "version: v1",
        "entries:",
        "  - mission_id: mission_001",
        "    title: Mission One",
        "    status: held",
        "    readiness_status: ready",
      ].join("\n"),
      "utf8",
    );

    const stored = await buildSnapshot({ repoRoot, generatedAt: "2026-05-02T00:00:00.000Z" });
    const sameSources = await buildSnapshot({ repoRoot, generatedAt: "2026-05-02T00:01:00.000Z" });
    assert.equal(compareSnapshotFreshness(stored, sameSources).ok, true);

    await writeFile(
      missionIndexPath,
      [
        "version: v1",
        "entries:",
        "  - mission_id: mission_001",
        "    title: Mission One Updated",
        "    status: held",
        "    readiness_status: ready",
      ].join("\n"),
      "utf8",
    );

    const changedSources = await buildSnapshot({ repoRoot, generatedAt: "2026-05-02T00:02:00.000Z" });
    const freshness = compareSnapshotFreshness(stored, changedSources);
    assert.equal(freshness.ok, false);
    assert.equal(freshness.changed_sources.some((source) => source.id === "mission_index"), true);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

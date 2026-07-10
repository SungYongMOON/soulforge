import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { ingestFromFile, mapSoulforgeSnapshot } from "../src/adapter.mjs";

const PUBLIC_SNAPSHOT_FIXTURE = fileURLToPath(
  new URL("../../../fixtures/operation-board/public-safe.sample.json", import.meta.url),
);

test("canonical public snapshot fixture maps operation-board items", () => {
  const snapshot = JSON.parse(readFileSync(PUBLIC_SNAPSHOT_FIXTURE, "utf8"));
  const mapped = mapSoulforgeSnapshot(snapshot);

  assert.equal(mapped.projects.length, snapshot.operation_board.sections.dungeon_map.items.length);
  assert.equal(mapped.items.length, snapshot.operation_board.sections.mission_board.items.length);
  assert.deepEqual(
    mapped.projects.map((project) => project.id),
    snapshot.operation_board.sections.dungeon_map.items.map((item) => item.project_code),
  );
  assert.deepEqual(
    mapped.items.map((item) => item.id),
    snapshot.operation_board.sections.mission_board.items.map((item) => item.mission_id),
  );
});

test("canonical empty items arrays take precedence over legacy rows", () => {
  const mapped = mapSoulforgeSnapshot({
    schema_version: "soulforge.snapshot.v0",
    operation_board: {
      sections: {
        dungeon_map: {
          items: [],
          rows: [{ project_code: "LEGACY-PROJECT" }],
        },
        mission_board: {
          items: [],
          rows: [{ mission_id: "legacy-mission", project_code: "LEGACY-PROJECT" }],
        },
      },
    },
  });

  assert.deepEqual(mapped.projects, []);
  assert.deepEqual(mapped.items, []);
});

test("ingestFromFile treats a full Soulforge snapshot as a snapshot, not normalized JSON", () => {
  const root = mkdtempSync(join(tmpdir(), "dev-erp-snapshot-contract-"));
  const snapshotPath = join(root, "snapshot.json");
  const snapshot = JSON.parse(readFileSync(PUBLIC_SNAPSHOT_FIXTURE, "utf8"));
  snapshot.projects = snapshot.operation_board.sections.dungeon_map.items.map((item) => ({
    project_code: item.project_code,
    workspace_present: item.workspace_present,
  }));
  snapshot.missions = {
    items: snapshot.operation_board.sections.mission_board.items.map((item) => ({ ...item })),
  };
  writeFileSync(snapshotPath, JSON.stringify(snapshot), "utf8");

  try {
    const store = createRecordingStore();
    const report = ingestFromFile(store, snapshotPath);

    assert.equal(report.projects, snapshot.operation_board.sections.dungeon_map.items.length);
    assert.equal(report.items, snapshot.operation_board.sections.mission_board.items.length);
    assert.deepEqual(report.skipped, []);
    assert.equal(store.projects[0].id, "SYN-OPS");
    assert.equal(store.items[0].id, "mission_fixture_blocked");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("ingestFromFile preserves the normalized JSON input contract", () => {
  const root = mkdtempSync(join(tmpdir(), "dev-erp-normalized-contract-"));
  const inputPath = join(root, "normalized.json");
  writeFileSync(inputPath, JSON.stringify({
    projects: [{ id: "NORMAL", title: "Normalized project" }],
    items: [{ id: "NORMAL-TASK", project_id: "NORMAL", title: "Normalized task" }],
  }), "utf8");

  try {
    const store = createRecordingStore();
    const report = ingestFromFile(store, inputPath);

    assert.equal(report.projects, 1);
    assert.equal(report.items, 1);
    assert.deepEqual(report.skipped, []);
    assert.equal(store.projects[0].id, "NORMAL");
    assert.equal(store.items[0].id, "NORMAL-TASK");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

function createRecordingStore() {
  const store = {
    projects: [],
    items: [],
    events: [],
    upsertProject(project) {
      this.projects.push(project);
    },
    upsertStage() {},
    upsertPerson() {},
    upsertItem(item) {
      this.items.push(item);
    },
    upsertMail() {},
    upsertArtifact() {},
    appendEvent(event) {
      this.events.push(event);
    },
  };
  return store;
}

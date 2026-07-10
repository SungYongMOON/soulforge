import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import {
  buildSnapshot,
  defaultSnapshotPath,
  validateSnapshot,
} from "../../../../guild_hall/snapshot/producer.mjs";
import { ingestFromFile, mapSoulforgeSnapshot } from "../src/adapter.mjs";
import { runRuntimeReleaseAudit } from "../tools/runtime_release_audit.mjs";

test("producer-built public-safe snapshot validates and maps nonzero operation-board rows", async () => {
  const fixture = await createProducerSnapshotFixture();
  const snapshotPath = join(fixture.root, "snapshot.json");
  writeFileSync(snapshotPath, JSON.stringify(fixture.snapshot), "utf8");

  try {
    const validation = validateSnapshot(fixture.snapshot);
    assert.deepEqual(validation, { ok: true, errors: [] });
    assert.ok(fixture.snapshot.projects.length > 0);
    assert.ok(fixture.snapshot.missions.items.length > 0);

    const mapped = mapSoulforgeSnapshot(fixture.snapshot);
    assert.equal(mapped.projects.length, fixture.snapshot.operation_board.sections.dungeon_map.items.length);
    assert.equal(mapped.items.length, fixture.snapshot.operation_board.sections.mission_board.items.length);
    assert.ok(mapped.projects.length > 0);
    assert.ok(mapped.items.length > 0);
    assert.deepEqual(
      mapped.projects.map((project) => project.id),
      fixture.snapshot.operation_board.sections.dungeon_map.items.map((item) => item.project_code),
    );
    assert.deepEqual(
      mapped.items.map((item) => item.id),
      fixture.snapshot.operation_board.sections.mission_board.items.map((item) => item.mission_id),
    );

    const store = createRecordingStore();
    const report = ingestFromFile(store, snapshotPath);
    assert.equal(report.projects, mapped.projects.length);
    assert.equal(report.items, mapped.items.length);
    assert.deepEqual(report.skipped, []);
    assert.deepEqual(store.projects.map((project) => project.id), mapped.projects.map((project) => project.id));
    assert.deepEqual(store.items.map((item) => item.id), mapped.items.map((item) => item.id));
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
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

test("ingestFromFile rejects snapshot-like inputs with missing or unsupported schemas", () => {
  const cases = [
    {
      name: "missing top-level schema",
      input: { operation_board: { schema_version: "soulforge.operation_board_projection.v0" } },
      expected: /unsupported_snapshot_schema:.*missing/,
    },
    {
      name: "unsupported top-level schema",
      input: {
        schema_version: "soulforge.snapshot.v999",
        operation_board: { schema_version: "soulforge.operation_board_projection.v0" },
      },
      expected: /unsupported_snapshot_schema:.*soulforge\.snapshot\.v999/,
    },
    {
      name: "missing operation-board schema",
      input: { schema_version: "soulforge.snapshot.v0", operation_board: {} },
      expected: /unsupported_operation_board_schema:.*missing/,
    },
    {
      name: "unsupported operation-board schema",
      input: {
        schema_version: "soulforge.snapshot.v0",
        operation_board: { schema_version: "soulforge.operation_board_projection.v999" },
      },
      expected: /unsupported_operation_board_schema:.*soulforge\.operation_board_projection\.v999/,
    },
  ];

  for (const fixture of cases) {
    const root = mkdtempSync(join(tmpdir(), "dev-erp-snapshot-schema-"));
    const inputPath = join(root, "input.json");
    writeFileSync(inputPath, JSON.stringify(fixture.input), "utf8");
    try {
      assert.throws(
        () => ingestFromFile(createRecordingStore(), inputPath),
        fixture.expected,
        fixture.name,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test("ingestFromFile rejects unversioned unknown input instead of silently mapping zero rows", () => {
  const root = mkdtempSync(join(tmpdir(), "dev-erp-unknown-ingest-"));
  const inputPath = join(root, "input.json");
  writeFileSync(inputPath, JSON.stringify({ payload: [] }), "utf8");

  try {
    assert.throws(
      () => ingestFromFile(createRecordingStore(), inputPath),
      /unsupported_ingest_shape/,
    );
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

test("runtime release gate separates snapshot structural validity from deterministic freshness", async () => {
  const fixture = await createProducerSnapshotFixture();
  const snapshotPath = defaultSnapshotPath(fixture.root);
  mkdirSync(dirname(snapshotPath), { recursive: true });
  writeFileSync(snapshotPath, JSON.stringify(fixture.snapshot), "utf8");
  const auditOptions = {
    sourceRoot: fixture.root,
    runtimeRoot: fixture.root,
    dbPath: join(fixture.root, "data", "missing.db"),
    metaPath: join(fixture.root, "data", "missing-meta.json"),
    workspacesDir: join(fixture.root, "_workspaces"),
    snapshotPath,
    nasRoot: false,
    skipGit: true,
    skipNas: true,
    snapshotFreshness: true,
  };

  try {
    const freshAudit = await runRuntimeReleaseAudit(auditOptions);
    const fresh = freshAudit.checks.snapshot_readiness;
    assert.equal(fresh.ok, true);
    assert.equal(fresh.code, null);
    assert.equal(fresh.structural.status, "pass");
    assert.equal(fresh.freshness.status, "fresh");
    assert.equal(freshAudit.blockers.some((issue) => issue.code.startsWith("snapshot_")), false);

    writeFileSync(
      join(fixture.root, ".mission", "index.yaml"),
      missionIndexYaml({ suffix: " changed after stored snapshot" }),
      "utf8",
    );
    const staleAudit = await runRuntimeReleaseAudit(auditOptions);
    const stale = staleAudit.checks.snapshot_readiness;
    assert.equal(stale.ok, false);
    assert.equal(stale.code, "snapshot_stale");
    assert.equal(stale.structural.status, "pass");
    assert.equal(stale.freshness.status, "stale");
    assert.ok(stale.freshness.changed_source_ids.includes("mission_index"));
    assert.ok(staleAudit.blockers.some((issue) => issue.code === "snapshot_stale"));
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

async function createProducerSnapshotFixture() {
  const root = mkdtempSync(join(tmpdir(), "dev-erp-producer-snapshot-"));
  mkdirSync(join(root, ".mission"), { recursive: true });
  mkdirSync(join(root, "_workspaces", "SYN-OPS"), { recursive: true });
  mkdirSync(join(root, "_workspaces", "SYN-LAB"), { recursive: true });
  writeFileSync(join(root, ".mission", "index.yaml"), missionIndexYaml(), "utf8");

  try {
    const snapshot = await buildSnapshot({ repoRoot: root, generatedAt: "2026-07-10T00:00:00.000Z" });
    return { root, snapshot };
  } catch (error) {
    rmSync(root, { recursive: true, force: true });
    throw error;
  }
}

function missionIndexYaml({ suffix = "" } = {}) {
  return [
    "version: v1",
    "entries:",
    "  - mission_id: mission_fixture_blocked",
    `    title: Synthetic blocked mission${suffix}`,
    "    status: blocked",
    "    readiness_status: blocked",
    "    project_code: SYN-OPS",
    "  - mission_id: mission_fixture_ready",
    "    title: Synthetic ready mission",
    "    status: held",
    "    readiness_status: ready",
    "    project_code: SYN-LAB",
  ].join("\n");
}

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

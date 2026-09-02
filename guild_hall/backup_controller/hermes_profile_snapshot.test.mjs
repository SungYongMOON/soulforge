import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  HERMES_PROFILE_SNAPSHOT_SCHEMA,
  HERMES_RUNTIME_PROFILE_SCHEMA,
  HERMES_GENERATION_REF_NOTE_SCHEMA,
  HERMES_SNAPSHOT_GAPS,
  HermesSnapshotError,
  buildGenerationRefNote,
  buildHermesProfileSnapshot,
  buildRuntimeProfileRecords,
  generationRefFor,
  profileRefFor,
  runHermesProfileSnapshot,
  stampFor,
} from "./hermes_profile_snapshot.mjs";
import { parseHermesSnapshotArguments } from "./hermes_profile_snapshot_cli.mjs";
import { validateLaneRecord } from "../path_registry/src/source_lane_index.mjs";

const STAMP = "20260903T001500Z";
const SOUL_ONE = "# Synthetic soul one\n\nYou are a synthetic test persona.\n";
const SOUL_TWO = "# Synthetic soul two\n\n가나다 정규화 확인.\n";
const SECRET_BODY = "DO_NOT_READ_THIS_VALUE\n";
// The fixture database only needs a non-empty body. It deliberately does NOT
// carry a real SQLite header: that header ends in a NUL byte, and a NUL
// anywhere in a source file makes the repository path policy classify the whole
// file as binary and skip scanning it.
const SYNTHETIC_DB_BODY = "synthetic-database-body-not-a-real-sqlite-file\n";

function sha256(text) {
  return `sha256:${createHash("sha256").update(text, "utf8").digest("hex")}`;
}

// A synthetic stand-in for the Hermes profile tree. No real profile, no real
// credential, and nothing here starts a process.
async function createHermesFixture({ withLiveWal = true } = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), "soulforge-hermes-"));
  const hermesHome = path.join(root, "hermes");
  const dataRoot = path.join(root, "data");
  await mkdir(dataRoot, { recursive: true });

  const alpha = path.join(hermesHome, "profiles", "alpha-pm");
  const beta = path.join(hermesHome, "profiles", "beta-qa");
  for (const [profileRoot, soul] of [[alpha, SOUL_ONE], [beta, SOUL_TWO]]) {
    await mkdir(profileRoot, { recursive: true });
    await writeFile(path.join(profileRoot, "SOUL.md"), soul, "utf8");
    await writeFile(path.join(profileRoot, "config.yaml"), "model: synthetic\n", "utf8");
    await writeFile(path.join(profileRoot, "profile.yaml"), "name: synthetic\n", "utf8");
    for (const name of [".env", "auth.json", "auth.lock"]) {
      await writeFile(path.join(profileRoot, name), SECRET_BODY, "utf8");
    }
    for (const [dir, names] of [
      ["skills", ["research.md", "writing.md"]],
      ["hooks", ["stop.mjs"]],
      ["plans", ["weekly.md"]],
      ["cron", ["daily.yaml"]],
    ]) {
      await mkdir(path.join(profileRoot, dir), { recursive: true });
      for (const name of names) await writeFile(path.join(profileRoot, dir, name), "synthetic\n", "utf8");
    }
    for (const dir of ["sessions", "memories", "workspace"]) {
      await mkdir(path.join(profileRoot, dir), { recursive: true });
      await writeFile(path.join(profileRoot, dir, "one.json"), "{\"synthetic\":true}\n", "utf8");
    }
    // Excluded outright, so their bytes never enter any count.
    await mkdir(path.join(profileRoot, "logs"), { recursive: true });
    await writeFile(path.join(profileRoot, "logs", "run.log"), "x".repeat(4096), "utf8");
    await writeFile(path.join(profileRoot, "state.db"), SYNTHETIC_DB_BODY, "utf8");
    if (withLiveWal) await writeFile(path.join(profileRoot, "state.db-wal"), "wal-bytes", "utf8");
  }
  return { root, hermesHome, dataRoot };
}

test("the snapshot classifies every profile file by class and copies only the Sigil", async () => {
  const fixture = await createHermesFixture();
  const snapshot = await buildHermesProfileSnapshot({
    hermes_home: fixture.hermesHome,
    stamp: STAMP,
    running_profiles: ["alpha-pm"],
    now: () => new Date("2026-09-03T00:15:00.000Z"),
  });

  assert.equal(snapshot.schema_version, HERMES_PROFILE_SNAPSHOT_SCHEMA);
  // Structure, not a restorable agent.
  assert.equal(snapshot.claim_ceiling, "inventory_v0");
  assert.equal(snapshot.generation_ref, generationRefFor(STAMP));
  assert.equal(snapshot.profile_count, 2);

  const alpha = snapshot.profiles.find((profile) => profile.profile === "alpha-pm");
  assert.equal(alpha.profile_ref, profileRefFor("alpha-pm"));
  assert.equal(alpha.instruction.sha256, sha256(SOUL_ONE));
  assert.equal(alpha.config.config_yaml.sha256, sha256("model: synthetic\n"));
  assert.equal(alpha.config.profile_yaml.present, true);
  assert.deepEqual(alpha.capability.skills, ["research.md", "writing.md"]);
  assert.deepEqual(alpha.capability.hooks, ["stop.mjs"]);
  assert.deepEqual(alpha.schedule.cron, ["daily.yaml"]);
  assert.equal(alpha.running, true);
  assert.equal(snapshot.profiles.find((profile) => profile.profile === "beta-qa").running, false);

  // Volumes are counted and sized, never copied. `logs/` is not walked at all,
  // so its 4096 bytes appear nowhere.
  assert.equal(alpha.volume.sessions.file_count, 1);
  assert.equal(alpha.volume.memories.present, true);
  assert.equal(alpha.volume.workspace.present, true);
  assert.equal(alpha.volume.workspaces.present, false);
  assert.equal(JSON.stringify(snapshot).includes("run.log"), false);

  // Databases are measured and explicitly not captured; a live WAL is named.
  assert.equal(alpha.databases.live_write_ahead_log_present, true);
  assert.equal(alpha.databases.files.every((entry) => entry.bytes_captured === false), true);
  assert.deepEqual(alpha.databases.files.map((entry) => entry.name), ["state.db", "state.db-wal"]);

  // Secrets: existence and size only. No digest, and the value never appears.
  for (const secret of alpha.secrets) {
    assert.equal(secret.present, true);
    assert.equal(secret.bytes, Buffer.byteLength(SECRET_BODY, "utf8"));
    assert.equal(secret.captured, false);
    assert.equal(secret.digested, false);
    assert.equal("sha256" in secret, false);
  }
  assert.equal(JSON.stringify(snapshot).includes("DO_NOT_READ_THIS_VALUE"), false);
  assert.equal(JSON.stringify(snapshot).includes(sha256(SECRET_BODY)), false);

  for (const gap of snapshot.coverage_gaps) assert.ok(HERMES_SNAPSHOT_GAPS.includes(gap), gap);
  for (const expected of [
    "database_bytes_not_captured",
    "live_write_ahead_log_present",
    "memory_bytes_not_captured",
    "secret_material_not_captured",
    "session_bytes_not_captured",
    "workspace_bytes_not_captured",
  ]) assert.ok(snapshot.coverage_gaps.includes(expected), expected);
  // Liveness was supplied, so it is not unknown.
  assert.equal(snapshot.coverage_gaps.includes("running_state_unknown"), false);

  await rm(fixture.root, { recursive: true, force: true });
});

test("liveness is never guessed", async () => {
  const fixture = await createHermesFixture();
  const snapshot = await buildHermesProfileSnapshot({
    hermes_home: fixture.hermesHome, stamp: STAMP, now: () => new Date("2026-09-03T00:15:00.000Z"),
  });
  assert.ok(snapshot.coverage_gaps.includes("running_state_unknown"));
  for (const profile of snapshot.profiles) assert.equal(profile.running, null);

  await assert.rejects(
    buildHermesProfileSnapshot({ hermes_home: fixture.hermesHome, stamp: STAMP, running_profiles: "alpha-pm" }),
    (error) => error instanceof HermesSnapshotError && error.code === "running_profiles_invalid",
  );
  await rm(fixture.root, { recursive: true, force: true });
});

test("apply publishes the Sigil payload, verifies it by isolated readback, and seeds the workforce index", async () => {
  const fixture = await createHermesFixture();
  const options = {
    hermes_home: fixture.hermesHome,
    data_root: fixture.dataRoot,
    stamp: STAMP,
    running_profiles: ["alpha-pm"],
    now: () => new Date("2026-09-03T00:15:00.000Z"),
  };

  const planned = await runHermesProfileSnapshot(options);
  assert.equal(planned.mode, "plan");
  assert.equal(planned.written, false);
  assert.equal(planned.readback_verified_count, 0);
  await assert.rejects(readFile(path.join(
    fixture.dataRoot, "60_BACKUP_GENERATIONS", "hermes", `hermes-profiles-${STAMP}`, "generation.json",
  ), "utf8"));

  const applied = await runHermesProfileSnapshot({ ...options, apply: true });
  assert.equal(applied.mode, "apply");
  assert.equal(applied.payload_file_count, 2);
  assert.equal(applied.readback_verified_count, 2);
  assert.equal(applied.coverage_gaps.includes("readback_unverified"), false);
  assert.deepEqual(applied.withheld, ["backup_generation_pointer_withheld_no_collection_generation"]);

  const generationRoot = path.join(
    fixture.dataRoot, "60_BACKUP_GENERATIONS", "hermes", `hermes-profiles-${STAMP}`,
  );
  assert.equal(await readFile(path.join(generationRoot, "payload", "alpha-pm", "SOUL.md"), "utf8"), SOUL_ONE);
  assert.equal(await readFile(path.join(generationRoot, "payload", "beta-qa", "SOUL.md"), "utf8"), SOUL_TWO);
  // Only the Sigil is in the payload: no config, no database, no secret.
  assert.deepEqual(
    (await readdir(path.join(generationRoot, "payload", "alpha-pm"))).sort(),
    ["SOUL.md"],
  );

  const published = JSON.parse(await readFile(path.join(generationRoot, "generation.json"), "utf8"));
  assert.equal(published.payload.readback_verified_count, 2);
  assert.equal(published.claim_ceiling, "inventory_v0");

  // Hermes has no capture lane, so the catalog carries a withheld-record note,
  // not a fabricated backup_generation_pointer.
  const note = JSON.parse(await readFile(path.join(
    fixture.dataRoot, "10_SOURCE_CAPTURE_CATALOG", "hermes", "backup-generation-refs", `${STAMP}.json`,
  ), "utf8"));
  assert.equal(note.schema_version, HERMES_GENERATION_REF_NOTE_SCHEMA);
  assert.equal(note.lane_record_withheld, "backup_generation_pointer");
  assert.equal(note.lane_record_withheld_reason, "no_hermes_capture_generation_exists");
  assert.equal(note.human_acceptance_state, "pending");
  assert.throws(() => validateLaneRecord(note), /record_kind_invalid|record_invalid/u);

  const mark = JSON.parse(await readFile(path.join(
    fixture.dataRoot, "50_AI_WORKFORCE_INDEX", "runtime-profiles", "alpha-pm.json",
  ), "utf8"));
  assert.equal(mark.schema_version, HERMES_RUNTIME_PROFILE_SCHEMA);
  assert.equal(mark.profile_ref, profileRefFor("alpha-pm"));
  assert.equal(mark.soul_sha256, sha256(SOUL_ONE));
  assert.deepEqual(mark.skills, ["research.md", "writing.md"]);
  assert.equal(mark.running, true);
  // A seed is not a mark until a human accepts it.
  assert.equal(mark.agent_mark_state, "seed_not_accepted");

  // Nothing anywhere in the published tree carries a secret value or its hash.
  for (const relative of [
    ["generation.json"],
    ["payload", "alpha-pm", "SOUL.md"],
  ]) {
    const text = await readFile(path.join(generationRoot, ...relative), "utf8");
    assert.equal(text.includes("DO_NOT_READ_THIS_VALUE"), false);
    assert.equal(text.includes(sha256(SECRET_BODY)), false);
  }

  // Create-only.
  await assert.rejects(
    runHermesProfileSnapshot({ ...options, apply: true }),
    (error) => error instanceof HermesSnapshotError && error.code === "output_exists",
  );

  await rm(fixture.root, { recursive: true, force: true });
});

test("a supplied collection generation turns the catalog note into a real lane record", async () => {
  const fixture = await createHermesFixture();
  const applied = await runHermesProfileSnapshot({
    hermes_home: fixture.hermesHome,
    data_root: fixture.dataRoot,
    stamp: STAMP,
    apply: true,
    generation_seq: 4,
    now: () => new Date("2026-09-03T00:15:00.000Z"),
  });
  assert.deepEqual(applied.withheld, []);
  const record = JSON.parse(await readFile(path.join(
    fixture.dataRoot, "10_SOURCE_CAPTURE_CATALOG", "hermes", "backup-generation-refs", `${STAMP}.json`,
  ), "utf8"));
  assert.deepEqual({ ...validateLaneRecord(record) }, {
    record_kind: "backup_generation_pointer",
    source_ref: "source.hermes",
    generation_seq: 4,
    backup_generation_ref: generationRefFor(STAMP),
    content_digest: applied.content_digest,
    backed_up_at: "2026-09-03T00:15:00.000Z",
  });

  await assert.rejects(
    runHermesProfileSnapshot({
      hermes_home: fixture.hermesHome,
      data_root: fixture.dataRoot,
      stamp: "20260903T001600Z",
      generation_seq: 0,
    }),
    (error) => error instanceof HermesSnapshotError && error.code === "generation_seq_invalid",
  );

  await rm(fixture.root, { recursive: true, force: true });
});

test("the Hermes home is never written to, and overlapping roots are refused", async () => {
  const fixture = await createHermesFixture();
  const before = await buildHermesProfileSnapshot({
    hermes_home: fixture.hermesHome, stamp: STAMP, now: () => new Date("2026-09-03T00:15:00.000Z"),
  });

  await runHermesProfileSnapshot({
    hermes_home: fixture.hermesHome,
    data_root: fixture.dataRoot,
    stamp: STAMP,
    apply: true,
    now: () => new Date("2026-09-03T00:15:00.000Z"),
  });

  const after = await buildHermesProfileSnapshot({
    hermes_home: fixture.hermesHome, stamp: STAMP, now: () => new Date("2026-09-03T00:15:00.000Z"),
  });
  assert.deepEqual(after.profiles, before.profiles);
  assert.equal(after.content_digest, before.content_digest);

  await assert.rejects(
    runHermesProfileSnapshot({
      hermes_home: fixture.hermesHome,
      data_root: path.join(fixture.hermesHome, "spine"),
      stamp: STAMP,
    }),
    (error) => error instanceof HermesSnapshotError && error.code === "roots_overlap",
  );

  await rm(fixture.root, { recursive: true, force: true });
});

test("a profile without a soul is recorded as missing, not skipped silently", async () => {
  const fixture = await createHermesFixture();
  await rm(path.join(fixture.hermesHome, "profiles", "beta-qa", "SOUL.md"));
  const snapshot = await buildHermesProfileSnapshot({
    hermes_home: fixture.hermesHome, stamp: STAMP, now: () => new Date("2026-09-03T00:15:00.000Z"),
  });
  assert.ok(snapshot.coverage_gaps.includes("soul_missing"));
  const beta = snapshot.profiles.find((profile) => profile.profile === "beta-qa");
  assert.equal(beta.instruction.present, false);
  assert.equal(beta.instruction.sha256, null);
  assert.equal(snapshot.profile_count, 2);
  assert.equal(snapshot.payload.file_count, 1);

  const records = buildRuntimeProfileRecords(snapshot);
  assert.equal(records.length, 2);
  assert.equal(records.find((record) => record.profile === "beta-qa").soul_sha256, null);

  const note = buildGenerationRefNote(snapshot);
  assert.equal(note.profile_count, 2);
  assert.equal(note.content_digest, snapshot.content_digest);

  await rm(fixture.root, { recursive: true, force: true });
});

test("stamps and CLI arguments are exact", () => {
  assert.equal(stampFor(new Date("2026-09-03T00:15:00.000Z")), "20260903T001500Z");
  assert.equal(generationRefFor(STAMP), "backup.hermes.profiles.20260903t001500z");

  const parsed = parseHermesSnapshotArguments([
    "--hermes-home", path.join(os.tmpdir(), "hermes"),
    "--data-root", path.join(os.tmpdir(), "data"),
    "--running-profiles", "alpha-pm, beta-qa",
    "--apply",
  ]);
  assert.deepEqual(parsed.running_profiles, ["alpha-pm", "beta-qa"]);
  assert.equal(parsed.apply, true);
  assert.equal(parsed.generation_seq, null);

  for (const argv of [
    [],
    ["--hermes-home", path.join(os.tmpdir(), "hermes")],
    ["--hermes-home", path.join(os.tmpdir(), "h"), "--data-root", path.join(os.tmpdir(), "d"), "--running-profiles", "bad name"],
    ["--hermes-home", path.join(os.tmpdir(), "h"), "--data-root", path.join(os.tmpdir(), "d"), "--generation-seq", "x"],
  ]) {
    assert.throws(() => parseHermesSnapshotArguments(argv), (error) => typeof error?.code === "string");
  }
});

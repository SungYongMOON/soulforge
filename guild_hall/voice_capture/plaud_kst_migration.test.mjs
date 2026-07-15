import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { applyPlaudKstMigration, buildPlaudKstMigrationPlan } from "./plaud_kst_migration.mjs";

const PROVIDER_ID = "a9e337daa17368a5654408bd41fdf462";
const OLD_ID = "20260714_235746_plaud_cli_a9e337da";
const NEW_ID = "20260715_085746_plaud_cli_a9e337da";

test("PLAUD KST migration corrects active metadata and paths without rewriting transcript payloads", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-plaud-kst-"));
  try {
    const oldSessionRef = `_workspaces/system/voice_capture/sessions/2026-07-14/${OLD_ID}`;
    const oldSessionPath = path.join(repoRoot, oldSessionRef);
    const oldLibraryPath = path.join(repoRoot, `_workspaces/system/voice_capture/library/recordings/2026-07-14/${OLD_ID}`);
    const sourceEventPath = path.join(repoRoot, `_workmeta/P00-000_INBOX/reports/voice_source_events/voice_${OLD_ID}`);
    await mkdir(oldSessionPath, { recursive: true });
    await mkdir(oldLibraryPath, { recursive: true });
    await mkdir(path.join(repoRoot, "_workspaces/system/voice_capture/library/index"), { recursive: true });
    await mkdir(sourceEventPath, { recursive: true });
    await writeFile(path.join(oldSessionPath, "session_manifest.json"), `${JSON.stringify({
      schema_version: "soulforge.voice_capture_session.v0",
      session_id: OLD_ID,
      source: "plaud_cli_import",
      source_provider: "PLAUD",
      provider_recording_id: PROVIDER_ID,
      recorded_at_local: "2026-07-14T23:57:46+09:00",
      recorded_end_at_local: "2026-07-15T00:07:46+09:00",
      recorded_timezone: "Asia/Seoul",
      duration_seconds: 600,
      transcript: { ref: `${oldSessionRef}/transcript.txt` },
    }, null, 2)}\n`, "utf8");
    await writeFile(path.join(oldSessionPath, "transcript.txt"), `${OLD_ID}\n2026-07-14T23:57:46+09:00\n`, "utf8");
    await writeFile(path.join(oldLibraryPath, "recording_manifest.json"), `${JSON.stringify({ recording_id: OLD_ID, session_ref: oldSessionRef })}\n`, "utf8");
    await writeFile(path.join(repoRoot, "_workspaces/system/voice_capture/library/index/recordings.jsonl"), `${JSON.stringify({ recording_id: OLD_ID, recorded_at_local: "2026-07-14T23:57:46+09:00" })}\n`, "utf8");
    await writeFile(path.join(sourceEventPath, "source_event.yaml"), `source_ref: ${oldSessionRef}\nevent_time: 2026-07-14T23:57:46+09:00\n`, "utf8");

    const plan = await buildPlaudKstMigrationPlan({ repoRoot });
    assert.equal(plan.migration_count, 1);
    assert.equal(plan.mappings[0].new_session_id, NEW_ID);
    assert.equal(plan.mappings[0].new_recorded_at_local, "2026-07-15T08:57:46+09:00");
    await assert.rejects(
      applyPlaudKstMigration({ repoRoot, plan, apply: true, receiptRef: "../outside.json" }),
      /receipt must stay under _workmeta/u,
    );

    const receiptRef = "_workmeta/system/reports/voice_timestamp_migration/test_receipt.json";
    const result = await applyPlaudKstMigration({ repoRoot, plan, apply: true, receiptRef });
    assert.equal(result.applied, true);
    assert.equal(existsSync(oldSessionPath), false);

    const newSessionPath = path.join(repoRoot, `_workspaces/system/voice_capture/sessions/2026-07-15/${NEW_ID}`);
    const manifest = JSON.parse(await readFile(path.join(newSessionPath, "session_manifest.json"), "utf8"));
    assert.equal(manifest.session_id, NEW_ID);
    assert.equal(manifest.recorded_at_local, "2026-07-15T08:57:46+09:00");
    assert.equal(manifest.recorded_end_at_local, "2026-07-15T09:07:46+09:00");
    assert.equal(manifest.provider_timestamp.basis, "plaud_cli_utc_without_offset");
    assert.equal(await readFile(path.join(newSessionPath, "transcript.txt"), "utf8"), `${OLD_ID}\n2026-07-14T23:57:46+09:00\n`);
    const newSourceEventPath = path.join(repoRoot, `_workmeta/P00-000_INBOX/reports/voice_source_events/voice_${NEW_ID}/source_event.yaml`);
    assert.equal(existsSync(newSourceEventPath), true);
    assert.equal(await readFile(newSourceEventPath, "utf8"), `source_ref: _workspaces/system/voice_capture/sessions/2026-07-15/${NEW_ID}\nevent_time: 2026-07-15T08:57:46+09:00\n`);
    assert.equal(JSON.parse(await readFile(path.join(repoRoot, receiptRef), "utf8")).migration_count, 1);
    assert.equal((await buildPlaudKstMigrationPlan({ repoRoot })).migration_count, 0);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

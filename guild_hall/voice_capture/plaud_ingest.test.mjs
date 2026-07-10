import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  buildDefaultPlaudSyncProfile,
  buildPlaudLaunchdDefinition,
  buildPlaudSessionId,
  drainPlaudMailQueue,
  parsePlaudAudioUrl,
  parsePlaudFileOutput,
  parsePlaudRecentOutput,
  parsePlaudTranscript,
  parsePlaudVersion,
  renderPlaudLaunchdPlist,
  runPlaudSync,
} from "./plaud_ingest.mjs";

const RECORDING_ID = "df8097c8505379f1702100f6fbd9cc16";

test("PLAUD CLI parsers keep ids, availability, timestamps, and speaker labels", () => {
  const recent = parsePlaudRecentOutput(`
Recordings in the last 14 days: 1

  ${RECORDING_ID}  07-10 meeting  2026-07-10  1h16m
`);
  assert.deepEqual(recent, [{ id: RECORDING_ID, name: "07-10 meeting", date: "2026-07-10", duration_display: "1h16m" }]);

  const file = parsePlaudFileOutput(`
File Details:

  id:           ${RECORDING_ID}
  name:         07-10 meeting
  created_at:   2026-07-10T04:04:32.000Z
  start_at:     2026-07-10T04:04:32.000Z
  duration:     1h16m
  serial_number: private-device-value
  audio:        available
  transcript:   available
  summary:      available
`);
  assert.equal(file.id, RECORDING_ID);
  assert.equal(file.audio_available, true);
  assert.equal(file.transcript_available, true);
  assert.equal(file.summary_available, true);
  assert.equal(Object.hasOwn(file, "serial_number"), false);

  const segments = parsePlaudTranscript("[00:10 - 00:15] Speaker 1: 첫 문장\n[61:02 - 61:08] 두 번째 문장\n");
  assert.equal(segments.length, 2);
  assert.equal(segments[0].speaker, "Speaker 1");
  assert.equal(segments[1].speaker, "UNKNOWN");
  assert.equal(segments[1].start_seconds, 3662);
  assert.equal(parsePlaudAudioUrl("Audio Download URL:\nhttps://example.test/source.ogg?signature=secret\n"), "https://example.test/source.ogg?signature=secret");
  assert.equal(parsePlaudVersion("plaud 0.3.4\ncommit abc123\n"), "0.3.4");
});

test("PLAUD sync materializes one isolated session and skips the same provider id next time", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-plaud-sync-"));
  try {
    await mkdir(path.join(repoRoot, "_workspaces", "system", "voice_capture"), { recursive: true });
    const profile = {
      ...buildDefaultPlaudSyncProfile(),
      shared_workspace_required: false,
      register_library: false,
      write_workmeta_draft: false,
    };
    const commandRunner = (command, args) => {
      assert.equal(command, "plaud");
      if (args[0] === "recent") return `  ${RECORDING_ID}  07-10 meeting  2026-07-10  1h16m\n`;
      if (args[0] === "file") return [
        `id: ${RECORDING_ID}`,
        "name: 07-10 meeting",
        "created_at: 2026-07-10T04:04:32.000Z",
        "start_at: 2026-07-10T04:04:32.000Z",
        "duration: 1h16m",
        "serial_number: do-not-store",
        "audio: available",
        "transcript: available",
        "summary: available",
        "",
      ].join("\n");
      if (args[0] === "audio") return "Audio Download URL:\nhttps://example.test/source.ogg?signature=do-not-store\n";
      if (args[0] === "transcript") {
        mkdirSync(path.dirname(args.at(-1)), { recursive: true });
        writeFileSync(args.at(-1), "[00:10 - 00:15] Speaker 1: 첫 문장\n[00:16 - 00:20] Speaker 2: 두 번째 문장\n", "utf8");
        return `Transcript saved to ${args.at(-1)}\n`;
      }
      if (args[0] === "summary") {
        mkdirSync(path.dirname(args.at(-1)), { recursive: true });
        writeFileSync(args.at(-1), "provider summary", "utf8");
        return `Summary saved to ${args.at(-1)}\n`;
      }
      throw new Error(`unexpected command: ${args.join(" ")}`);
    };
    const audioDownloader = async (url, outputDir) => {
      assert.match(url, /^https:\/\/example\.test/u);
      const audioPath = path.join(outputDir, "source.ogg");
      await writeFile(audioPath, "fixture-audio", "utf8");
      return { path: audioPath, size_bytes: 13, sha256: "fixture-sha256" };
    };
    const audioProbe = async () => ({
      duration_seconds: 4568.42,
      format: "ogg",
      codec: "opus",
      sample_rate_hz: 48000,
      channels: 1,
    });

    const first = await runPlaudSync({
      repoRoot,
      profile,
      apply: true,
      skipPreflight: true,
      commandRunner,
      audioDownloader,
      audioProbe,
      now: new Date("2026-07-10T10:00:00.000Z"),
    });
    assert.equal(first.recordings[0].state, "imported");
    assert.equal(first.recordings[0].transcript_segments, 2);

    const sessionId = buildPlaudSessionId(new Date("2026-07-10T04:04:32.000Z"), RECORDING_ID);
    const sessionDir = path.join(repoRoot, "_workspaces", "system", "voice_capture", "sessions", "2026-07-10", sessionId);
    const manifest = JSON.parse(await readFile(path.join(sessionDir, "session_manifest.json"), "utf8"));
    assert.equal(manifest.provider_recording_id, RECORDING_ID);
    assert.equal(manifest.audio.evidence_role, "canonical_source_candidate");
    assert.equal(manifest.transcript.evidence_role, "auxiliary_unverified");
    assert.equal(manifest.provider_summary.direct_task_promotion_allowed, false);
    assert.equal(JSON.stringify(manifest).includes("signature=do-not-store"), false);
    assert.equal(JSON.stringify(manifest).includes("do-not-store"), false);

    const second = await runPlaudSync({ repoRoot, profile, skipPreflight: true, commandRunner });
    assert.equal(second.candidate_count, 0);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("PLAUD sync does not block canonical artifacts when optional summary download fails", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-plaud-summary-optional-"));
  try {
    const profile = {
      ...buildDefaultPlaudSyncProfile(),
      shared_workspace_required: false,
      register_library: false,
      write_workmeta_draft: false,
    };
    const commandRunner = (command, args) => {
      assert.equal(command, "plaud");
      if (args[0] === "recent") return `  ${RECORDING_ID}  Meeting  2026-07-10  10m\n`;
      if (args[0] === "file") return [
        `id: ${RECORDING_ID}`,
        "name: Meeting",
        "start_at: 2026-07-10T04:04:32.000Z",
        "audio: available",
        "transcript: available",
        "summary: available",
        "",
      ].join("\n");
      if (args[0] === "transcript") {
        mkdirSync(path.dirname(args.at(-1)), { recursive: true });
        writeFileSync(args.at(-1), "[00:01 - 00:05] Speaker 1: test\n", "utf8");
        return "saved\n";
      }
      if (args[0] === "summary") throw new Error("optional provider summary unavailable");
      if (args[0] === "audio") return "https://example.test/source.ogg?signature=private\n";
      throw new Error(`unexpected command: ${args.join(" ")}`);
    };
    const result = await runPlaudSync({
      repoRoot,
      profile,
      apply: true,
      skipPreflight: true,
      commandRunner,
      audioDownloader: async (url, outputDir) => {
        assert.match(url, /^https:\/\/example\.test/u);
        const audioPath = path.join(outputDir, "source.ogg");
        await writeFile(audioPath, "audio", "utf8");
        return { path: audioPath, size_bytes: 5, sha256: "fixture-sha256" };
      },
      audioProbe: async () => ({ duration_seconds: 10, format: "ogg", codec: "opus", sample_rate_hz: 48000, channels: 1 }),
    });
    assert.equal(result.recordings[0].state, "imported");
    assert.equal(result.recordings[0].provider_summary_fetch_failed, true);
    const manifest = JSON.parse(await readFile(path.join(repoRoot, result.recordings[0].session_ref, "session_manifest.json"), "utf8"));
    assert.equal(manifest.provider_summary.status, "provider_output_failed_optional");
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("PLAUD launchd definition watches the mail queue and keeps generated files node-local", () => {
  const repoRoot = path.join(os.tmpdir(), "soulforge-fixture");
  const definition = buildPlaudLaunchdDefinition({ repoRoot, nodeId: "home_always_on_01" });
  assert.equal(definition.trigger, "hiworks_mail_queue_watch");
  assert.match(definition.output_dir, /_workspaces\/_local\/home_always_on_01\/launchd$/u);
  assert.match(renderPlaudLaunchdPlist(definition), /<key>WatchPaths<\/key>/u);
  assert.equal(renderPlaudLaunchdPlist(definition).includes("StartInterval"), false);
  assert.match(renderPlaudLaunchdPlist(definition), /<key>ThrottleInterval<\/key><integer>300<\/integer>/u);
});

test("PLAUD launchd also watches the durable local-ASR queue when independent transcription is enabled", () => {
  const repoRoot = path.join(os.tmpdir(), "soulforge-fixture");
  const profile = {
    ...buildDefaultPlaudSyncProfile(),
    independent_asr: {
      ...buildDefaultPlaudSyncProfile().independent_asr,
      enabled: true,
    },
  };
  const definition = buildPlaudLaunchdDefinition({ repoRoot, profile });
  assert.equal(definition.watch_paths.length, 2);
  const plist = renderPlaudLaunchdPlist(definition);
  assert.match(plist, /plaud_mail_triggers\/pending/u);
  assert.match(plist, /local_asr_queue\/pending/u);
});

test("PLAUD watcher drains a pending local-ASR queue even when no mail trigger is waiting", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-plaud-asr-only-"));
  try {
    const profile = {
      ...buildDefaultPlaudSyncProfile(),
      independent_asr: {
        ...buildDefaultPlaudSyncProfile().independent_asr,
        enabled: true,
      },
    };
    let invoked = 0;
    const result = await drainPlaudMailQueue({
      repoRoot,
      profile,
      apply: true,
      localAsrProfile: { max_sessions_per_queue_run: 1 },
      localAsrQueueDrainer: async (options) => {
        invoked += 1;
        assert.equal(options.apply, true);
        return { applied: true, remaining_pending_count: 1, retry_required: true };
      },
    });
    assert.equal(invoked, 1);
    assert.equal(result.pending_count, 0);
    assert.equal(result.retry_required, true);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("PLAUD mail queue drain moves a trigger only after a new recording imports", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-plaud-trigger-"));
  try {
    const profile = {
      ...buildDefaultPlaudSyncProfile(),
      shared_workspace_required: false,
      register_library: false,
      write_workmeta_draft: false,
    };
    const pendingDir = path.join(repoRoot, profile.output_root, "plaud_mail_triggers", "pending");
    await mkdir(pendingDir, { recursive: true });
    await writeFile(path.join(pendingDir, "trigger.json"), JSON.stringify({ trigger_id: "fixture", enqueued_at: "2026-07-10T09:59:00Z" }), "utf8");
    const result = await drainPlaudMailQueue({
      repoRoot,
      profile,
      apply: true,
      syncRunner: async () => ({
        ok: true,
        recent_count: 1,
        new_candidate_count: 1,
        candidate_count: 1,
        truncated_new_candidate_count: 0,
        recordings: [{ id: RECORDING_ID, state: "imported" }],
      }),
      now: new Date("2026-07-10T10:00:00.000Z"),
    });
    assert.equal(result.processed_count, 1);
    await assert.rejects(readFile(path.join(pendingDir, "trigger.json"), "utf8"));
    assert.equal(
      await readFile(path.join(repoRoot, profile.output_root, "plaud_mail_triggers", "processed", "2026-07-10", "trigger.json"), "utf8"),
      JSON.stringify({ trigger_id: "fixture", enqueued_at: "2026-07-10T09:59:00Z" }),
    );
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("PLAUD mail queue drain keeps a trigger when only unrelated existing recordings are visible", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-plaud-trigger-unmatched-"));
  try {
    const profile = { ...buildDefaultPlaudSyncProfile(), shared_workspace_required: false };
    const pendingDir = path.join(repoRoot, profile.output_root, "plaud_mail_triggers", "pending");
    await mkdir(pendingDir, { recursive: true });
    await writeFile(path.join(pendingDir, "trigger.json"), JSON.stringify({ enqueued_at: "2026-07-10T09:59:00Z" }), "utf8");
    const result = await drainPlaudMailQueue({
      repoRoot,
      profile,
      apply: true,
      syncRunner: async () => ({
        ok: true,
        recent_count: 3,
        new_candidate_count: 0,
        candidate_count: 0,
        truncated_new_candidate_count: 0,
        recordings: [],
      }),
      now: new Date("2026-07-10T10:00:00.000Z"),
    });
    assert.equal(result.retry_required, true);
    assert.equal(result.resolution, "waiting_for_matching_import");
    assert.equal(await readFile(path.join(pendingDir, "trigger.json"), "utf8"), JSON.stringify({ enqueued_at: "2026-07-10T09:59:00Z" }));
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("PLAUD mail queue resolves at most one oldest trigger per imported recording", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-plaud-trigger-batch-"));
  try {
    const profile = { ...buildDefaultPlaudSyncProfile(), shared_workspace_required: false };
    const pendingDir = path.join(repoRoot, profile.output_root, "plaud_mail_triggers", "pending");
    await mkdir(pendingDir, { recursive: true });
    await writeFile(path.join(pendingDir, "newer.json"), JSON.stringify({ enqueued_at: "2026-07-10T09:59:30Z" }), "utf8");
    await writeFile(path.join(pendingDir, "older.json"), JSON.stringify({ enqueued_at: "2026-07-10T09:59:00Z" }), "utf8");
    const result = await drainPlaudMailQueue({
      repoRoot,
      profile,
      apply: true,
      syncRunner: async () => ({
        ok: true,
        recent_count: 1,
        truncated_new_candidate_count: 0,
        recordings: [{ id: RECORDING_ID, state: "imported" }],
      }),
      now: new Date("2026-07-10T10:00:00.000Z"),
    });
    assert.equal(result.processed_count, 1);
    assert.equal(result.remaining_pending_count, 1);
    assert.equal(result.retry_required, true);
    assert.equal(await readFile(path.join(pendingDir, "newer.json"), "utf8"), JSON.stringify({ enqueued_at: "2026-07-10T09:59:30Z" }));
    assert.equal(
      await readFile(path.join(repoRoot, profile.output_root, "plaud_mail_triggers", "processed", "2026-07-10", "older.json"), "utf8"),
      JSON.stringify({ enqueued_at: "2026-07-10T09:59:00Z" }),
    );
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("PLAUD mail queue reserves trigger slots for retryable recordings in a mixed sync", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-plaud-trigger-mixed-sync-"));
  try {
    const profile = { ...buildDefaultPlaudSyncProfile(), shared_workspace_required: false };
    const pendingDir = path.join(repoRoot, profile.output_root, "plaud_mail_triggers", "pending");
    await mkdir(pendingDir, { recursive: true });
    await writeFile(path.join(pendingDir, "first.json"), JSON.stringify({ enqueued_at: "2026-07-10T09:59:00Z" }), "utf8");
    await writeFile(path.join(pendingDir, "second.json"), JSON.stringify({ enqueued_at: "2026-07-10T09:59:30Z" }), "utf8");
    const result = await drainPlaudMailQueue({
      repoRoot,
      profile,
      apply: true,
      syncRunner: async () => ({
        ok: true,
        recent_count: 2,
        truncated_new_candidate_count: 0,
        recordings: [
          { id: RECORDING_ID, state: "imported" },
          { id: "a".repeat(32), state: "pending_provider_processing" },
        ],
      }),
      now: new Date("2026-07-10T10:00:00.000Z"),
    });
    assert.equal(result.processed_count, 1);
    assert.equal(result.remaining_pending_count, 1);
    assert.equal(result.retry_required, true);
    assert.equal(await readFile(path.join(pendingDir, "second.json"), "utf8"), JSON.stringify({ enqueued_at: "2026-07-10T09:59:30Z" }));
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("PLAUD mail queue expires only old triggers and keeps newer triggers pending", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-plaud-trigger-mixed-age-"));
  try {
    const profile = {
      ...buildDefaultPlaudSyncProfile(),
      shared_workspace_required: false,
      launchd: { ...buildDefaultPlaudSyncProfile().launchd, unresolved_after_seconds: 60 },
    };
    const pendingDir = path.join(repoRoot, profile.output_root, "plaud_mail_triggers", "pending");
    await mkdir(pendingDir, { recursive: true });
    await writeFile(path.join(pendingDir, "old.json"), JSON.stringify({ enqueued_at: "2026-07-10T09:55:00Z" }), "utf8");
    await writeFile(path.join(pendingDir, "new.json"), JSON.stringify({ enqueued_at: "2026-07-10T09:59:30Z" }), "utf8");
    const result = await drainPlaudMailQueue({
      repoRoot,
      profile,
      apply: true,
      syncRunner: async () => ({ ok: true, recent_count: 2, truncated_new_candidate_count: 0, recordings: [] }),
      now: new Date("2026-07-10T10:00:00.000Z"),
    });
    assert.equal(result.unresolved_count, 1);
    assert.equal(result.remaining_pending_count, 1);
    assert.equal(result.retry_required, true);
    assert.equal(await readFile(path.join(pendingDir, "new.json"), "utf8"), JSON.stringify({ enqueued_at: "2026-07-10T09:59:30Z" }));
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("PLAUD mail queue moves an unmatched old trigger to unresolved review", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-plaud-trigger-unresolved-"));
  try {
    const profile = {
      ...buildDefaultPlaudSyncProfile(),
      shared_workspace_required: false,
      launchd: { ...buildDefaultPlaudSyncProfile().launchd, unresolved_after_seconds: 60 },
    };
    const pendingDir = path.join(repoRoot, profile.output_root, "plaud_mail_triggers", "pending");
    await mkdir(pendingDir, { recursive: true });
    await writeFile(path.join(pendingDir, "trigger.json"), JSON.stringify({ enqueued_at: "2026-07-10T09:55:00Z" }), "utf8");
    const result = await drainPlaudMailQueue({
      repoRoot,
      profile,
      apply: true,
      syncRunner: async () => ({ ok: true, recent_count: 2, truncated_new_candidate_count: 0, recordings: [] }),
      now: new Date("2026-07-10T10:00:00.000Z"),
    });
    assert.equal(result.retry_required, false);
    assert.equal(result.unresolved_count, 1);
    assert.equal(result.resolution, "unresolved_requires_review");
    assert.equal(
      await readFile(path.join(repoRoot, profile.output_root, "plaud_mail_triggers", "unresolved", "2026-07-10", "trigger.json"), "utf8"),
      JSON.stringify({ enqueued_at: "2026-07-10T09:55:00Z" }),
    );
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("PLAUD mail queue drain retains the trigger when no recent recording is visible yet", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-plaud-trigger-retry-"));
  try {
    const profile = {
      ...buildDefaultPlaudSyncProfile(),
      shared_workspace_required: false,
      register_library: false,
      write_workmeta_draft: false,
    };
    const pendingDir = path.join(repoRoot, profile.output_root, "plaud_mail_triggers", "pending");
    await mkdir(pendingDir, { recursive: true });
    await writeFile(path.join(pendingDir, "trigger.json"), "{}", "utf8");
    const result = await drainPlaudMailQueue({
      repoRoot,
      profile,
      apply: true,
      skipPreflight: true,
      commandRunner: () => "No recordings in the last 14 days.\n",
    });
    assert.equal(result.retry_required, true);
    assert.equal(result.processed_count, 0);
    assert.equal(await readFile(path.join(pendingDir, "trigger.json"), "utf8"), "{}");
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("PLAUD sync keeps a recording retryable when the required transcript cannot be parsed", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-plaud-transcript-empty-"));
  try {
    const profile = {
      ...buildDefaultPlaudSyncProfile(),
      shared_workspace_required: false,
      register_library: false,
      write_workmeta_draft: false,
    };
    const commandRunner = (command, args) => {
      assert.equal(command, "plaud");
      if (args[0] === "recent") return `  ${RECORDING_ID}  Meeting  2026-07-10  10m\n`;
      if (args[0] === "file") return [
        `id: ${RECORDING_ID}`,
        "name: Meeting",
        "start_at: 2026-07-10T04:04:32.000Z",
        "audio: available",
        "transcript: available",
        "summary: -",
        "",
      ].join("\n");
      if (args[0] === "transcript") {
        mkdirSync(path.dirname(args.at(-1)), { recursive: true });
        writeFileSync(args.at(-1), "timestamp 형식이 없는 전사", "utf8");
        return "saved\n";
      }
      throw new Error(`unexpected command: ${args.join(" ")}`);
    };
    const result = await runPlaudSync({
      repoRoot,
      profile,
      apply: true,
      skipPreflight: true,
      commandRunner,
    });
    assert.equal(result.recordings[0].state, "import_failed_retryable");
    assert.equal(result.recordings[0].failure_kind, "transcript_parse_empty");
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

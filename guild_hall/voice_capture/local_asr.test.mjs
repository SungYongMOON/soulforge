import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  analyzeLocalAsrBacklog,
  analyzeLocalAsrSession,
  buildChunkWindows,
  buildDefaultLocalAsrProfile,
  buildLocalAsrPreflight,
  discoverLocalAsrSessions,
  enqueueLocalAsrBacklog,
  parseWhisperJson,
} from "./local_asr.mjs";

test("local ASR chunk windows overlap input but keep one nominal ownership range", () => {
  assert.deepEqual(buildChunkWindows(25, { chunkSeconds: 10, overlapSeconds: 2 }), [
    {
      chunk_index: 1,
      nominal_start_seconds: 0,
      nominal_end_seconds: 10,
      extract_start_seconds: 0,
      extract_duration_seconds: 12,
    },
    {
      chunk_index: 2,
      nominal_start_seconds: 10,
      nominal_end_seconds: 20,
      extract_start_seconds: 8,
      extract_duration_seconds: 14,
    },
    {
      chunk_index: 3,
      nominal_start_seconds: 20,
      nominal_end_seconds: 25,
      extract_start_seconds: 18,
      extract_duration_seconds: 7,
    },
  ]);
});

test("local ASR parser converts chunk-relative offsets and removes overlap duplicates", () => {
  const window = buildChunkWindows(20, { chunkSeconds: 10, overlapSeconds: 2 })[1];
  const rows = parseWhisperJson({
    transcription: [
      { offsets: { from: 0, to: 1000 }, text: "중복" },
      { offsets: { from: 2000, to: 4000 }, text: "유효 구간" },
      { offsets: { from: 11500, to: 13000 }, text: "다음 구간" },
    ],
  }, window, { runId: "fixture" });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].start_seconds, 10);
  assert.equal(rows[0].end_seconds, 12);
  assert.equal(rows[0].speaker, "UNKNOWN");
  assert.equal(rows[0].analysis_run_id, "fixture");
});

test("local ASR writes versioned independent transcript without replacing provider transcript", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-local-asr-"));
  try {
    const fixture = await createSessionFixture(repoRoot);
    const profile = {
      ...buildDefaultLocalAsrProfile(),
      model_path: "model.bin",
      run_id: "fixture_run_v1",
      chunk_seconds: 10,
      overlap_seconds: 2,
      terms_prompt: "PROJECT-X",
    };
    await writeFile(path.join(repoRoot, "model.bin"), "model", "utf8");
    const calls = [];
    const commandRunner = commandFixture(calls);

    const result = await analyzeLocalAsrSession({
      repoRoot,
      profile,
      sessionDir: fixture.sessionDir,
      apply: true,
      commandRunner,
    });
    assert.equal(result.state, "completed");
    assert.equal(result.segment_count, 2);
    assert.equal(result.provider_transcript_used_as_input, false);
    assert.equal(calls.filter((row) => row.command === profile.ffmpeg_binary).length, 2);
    assert.equal(calls.filter((row) => row.command === profile.asr_binary).length, 2);

    const providerTranscript = await readFile(path.join(fixture.sessionDir, "transcript.txt"), "utf8");
    assert.equal(providerTranscript, "provider transcript must stay unchanged\n");
    const outputDir = path.join(fixture.sessionDir, profile.output_subdir, profile.run_id);
    const transcriptRows = (await readFile(path.join(outputDir, "transcript.jsonl"), "utf8"))
      .trim().split("\n").map((line) => JSON.parse(line));
    assert.deepEqual(transcriptRows.map((row) => row.content), ["첫 구간", "둘째 구간"]);
    assert.deepEqual(transcriptRows.map((row) => row.segment_id), [1, 2]);

    const contextSource = JSON.parse(await readFile(path.join(outputDir, "project_context_source.json"), "utf8"));
    assert.equal(contextSource.source_kind, "voice");
    assert.deepEqual(contextSource.companion_input_kinds, ["mail", "se_schedule"]);
    assert.equal(contextSource.raw_payload_copied, false);

    const manifest = JSON.parse(await readFile(path.join(fixture.sessionDir, "session_manifest.json"), "utf8"));
    assert.equal(manifest.independent_transcription.status, "completed");
    assert.equal(manifest.independent_transcription.speaker_identity_verified, false);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("local ASR backlog discovery skips completed current-run sessions and queues only pending audio", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-local-asr-backlog-"));
  try {
    const fixture = await createSessionFixture(repoRoot);
    const profile = {
      ...buildDefaultLocalAsrProfile(),
      model_path: "model.bin",
      run_id: "fixture_run_v1",
      chunk_seconds: 30,
      overlap_seconds: 0,
    };
    await writeFile(path.join(repoRoot, "model.bin"), "model", "utf8");
    const discovered = await discoverLocalAsrSessions({ repoRoot, profile });
    assert.equal(discovered.length, 1);
    assert.equal(discovered[0].state, "needs_analysis");

    const planned = await analyzeLocalAsrBacklog({ repoRoot, profile });
    assert.equal(planned.pending_count, 1);
    assert.equal(planned.applied, false);

    const queued = await enqueueLocalAsrBacklog({ repoRoot, profile, apply: true });
    assert.equal(queued.queued_count, 1);
    const queueRef = queued.results[0].queue_ref;
    const queue = JSON.parse(await readFile(path.join(repoRoot, queueRef), "utf8"));
    assert.equal(queue.session_ref, path.relative(repoRoot, fixture.sessionDir));
    assert.equal(queue.raw_payload_copied, false);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("local ASR preflight checks engine, ffmpeg, and model without reading source payload", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-local-asr-preflight-"));
  try {
    await writeFile(path.join(repoRoot, "model.bin"), "model", "utf8");
    const profile = {
      ...buildDefaultLocalAsrProfile(),
      asr_binary: process.execPath,
      ffmpeg_binary: process.execPath,
      model_path: "model.bin",
      model_sha1: null,
    };
    const report = await buildLocalAsrPreflight({ repoRoot, profile });
    assert.equal(report.ok, true);
    assert.equal(report.blockers.length, 0);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

async function createSessionFixture(repoRoot) {
  const sessionDir = path.join(repoRoot, "_workspaces", "system", "voice_capture", "sessions", "2026-07-10", "fixture_session");
  const audioRef = "_workspaces/system/voice_capture/sessions/2026-07-10/fixture_session/audio/source.mp3";
  await mkdir(path.join(sessionDir, "audio"), { recursive: true });
  await writeFile(path.join(repoRoot, audioRef), "fixture audio", "utf8");
  await writeFile(path.join(sessionDir, "transcript.txt"), "provider transcript must stay unchanged\n", "utf8");
  await writeFile(path.join(sessionDir, "session_manifest.json"), `${JSON.stringify({
    schema_version: "soulforge.voice_capture_session.v0",
    session_id: "fixture_session",
    source: "plaud_cli_import",
    source_sha256: "fixture-audio-sha",
    recorded_at_local: "2026-07-10T10:00:00+09:00",
    duration_seconds: 12,
    audio: { ref: audioRef, sha256: "fixture-audio-sha" },
    transcript: { status: "provider_transcript_present_unverified", ref: path.posix.join(path.relative(repoRoot, sessionDir), "transcript.txt") },
  }, null, 2)}\n`, "utf8");
  return { sessionDir };
}

function commandFixture(calls) {
  return (command, args) => {
    calls.push({ command, args: [...args] });
    if (command === "ffmpeg") {
      writeFileSync(args.at(-1), "wav", "utf8");
      return { status: 0 };
    }
    if (command === "whisper-cli") {
      const outputBase = args[args.indexOf("-of") + 1];
      const chunkNumber = Number(path.basename(outputBase).split("_").at(-1));
      const transcription = chunkNumber === 1
        ? [
            { offsets: { from: 0, to: 4000 }, text: "첫 구간" },
            { offsets: { from: 10500, to: 11500 }, text: "겹침 제외" },
          ]
        : [
            { offsets: { from: 0, to: 1000 }, text: "겹침 제외" },
            { offsets: { from: 2000, to: 3500 }, text: "둘째 구간" },
          ];
      writeFileSync(`${outputBase}.json`, JSON.stringify({ transcription }), "utf8");
      writeFileSync(`${outputBase}.txt`, "fixture", "utf8");
      writeFileSync(`${outputBase}.srt`, "fixture", "utf8");
      return { status: 0 };
    }
    throw new Error(`unexpected command: ${command}`);
  };
}

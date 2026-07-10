import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import {
  buildChunkPlan,
  buildPreflightReport,
  buildPlanPreview,
  buildSessionPlan,
  buildSessionStatus,
  extractTextFromAsrJson,
  loadVoiceCaptureProfile,
  profileToSessionOptions,
  renderCommandTemplate,
  renderSourceEventDraft,
  runCaptureSession,
  shellQuote,
  validateSessionDir,
  writeVoiceCaptureLaunchdPlist,
  writeVoiceCaptureProfile,
  writeRecordingLibraryEntry,
  writeWorkmetaDraft,
} from "./voice_capture.mjs";

test("renderCommandTemplate shell-quotes file paths and rejects unknown placeholders", () => {
  const transcriptPath = path.join(path.sep, "tmp", "voice capture", "chunk 'one'.txt");
  const rendered = renderCommandTemplate("printf hi > {transcript_txt}", {
    transcript_txt: transcriptPath,
  });
  assert.equal(rendered, `printf hi > ${shellQuote(transcriptPath)}`);
  assert.throws(() => renderCommandTemplate("echo {missing}", {}), /unknown voice capture template placeholder/);
});

test("buildSessionPlan keeps raw capture artifacts under _workspaces by default", () => {
  const repoRoot = path.resolve(path.join(path.sep, "repo"));
  const now = new Date("2026-06-26T04:04:05.000Z");
  const plan = buildSessionPlan({
    repoRoot,
    label: "daily mic",
    now,
    chunkSeconds: 60,
    maxChunks: 2,
    recordCmd: "record {audio}",
    asrCmd: "asr {audio} {output_base}",
  });
  assert.equal(plan.session_id, "20260626_130405_daily_mic");
  assert.equal(
    plan.session_dir,
    path.join(
      repoRoot,
      "_workspaces",
      "system",
      "voice_capture",
      "sessions",
      "2026-06-26",
      "20260626_130405_daily_mic",
    ),
  );
  assert.equal(plan.raw_payload_boundary.workmeta_raw_audio_copy_allowed, false);
  assert.equal(plan.max_chunks, 2);

  const chunk = buildChunkPlan(plan, 1);
  assert.equal(normalizePath(chunk.audio_ref).endsWith("/audio/chunk_000001.wav"), true);
  assert.equal(normalizePath(chunk.transcript_json_ref).endsWith("/transcripts/chunk_000001.json"), true);

  const preview = buildPlanPreview(plan);
  assert.equal(preview.first_chunk.chunk_index, 1);
});

test("renderSourceEventDraft points to artifacts without embedding transcript text", () => {
  const plan = buildSessionPlan({
    repoRoot: path.join(path.sep, "repo"),
    sessionId: "fixture_session",
    label: "secret meeting",
    now: new Date("2026-06-26T04:04:05.000Z"),
    recordCmd: "record {audio}",
  });
  const draft = renderSourceEventDraft(plan);
  assert.match(draft, /raw_payload_copied: false/);
  assert.match(draft, /project_code_candidate: P00-000_INBOX/);
  assert.match(draft, /_workspaces\/system\/voice_capture\/sessions/);
  assert.equal(draft.includes("DO_NOT_EMBED_TRANSCRIPT_TEXT"), false);
});

test("runCaptureSession can execute one fixture chunk and write transcript jsonl", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-voice-capture-"));
  try {
    const result = await runCaptureSession({
      repoRoot,
      label: "fixture",
      now: new Date("2026-06-26T04:04:05.000Z"),
      chunkSeconds: 1,
      maxChunks: 1,
      recordCmd: nodeWriteFileCommand("{audio}", "audio"),
      asrCmd: nodeWriteFileCommand("{transcript_txt}", "transcript"),
    });
    assert.equal(result.chunks_completed, 1);

    const validation = await validateSessionDir(result.session.session_dir);
    assert.equal(validation.ok, true);

    const transcriptJsonl = await readFile(result.session.output_refs.transcript_jsonl, "utf8");
    const segment = JSON.parse(transcriptJsonl.trim());
    assert.equal(segment.text, "transcript");
    assert.equal(segment.start_seconds, 0);
    assert.equal(segment.end_seconds, 1);

    const transcriptTxt = await readFile(result.session.output_refs.transcript_txt, "utf8");
    assert.equal(transcriptTxt.trim(), "[00:00 --> 00:01] transcript");

    const sourceDraft = await readFile(result.session.output_refs.source_event_draft, "utf8");
    assert.match(sourceDraft, /workmeta_write_ready: false/);
    assert.match(sourceDraft, /transcript_txt_ref:/);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("extractTextFromAsrJson supports common ASR shapes", () => {
  assert.equal(extractTextFromAsrJson({ text: "hello" }), "hello");
  assert.equal(extractTextFromAsrJson({ segments: [{ text: "hello" }, { text: "world" }] }), "hello world");
  assert.equal(extractTextFromAsrJson({ transcription: [{ text: "one" }, { text: "two" }] }), "one two");
});

test("profile config can be written, loaded, and converted to session options", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-voice-profile-"));
  try {
    const modelPath = path.join(repoRoot, "ggml-test.bin");
    await writeFile(modelPath, "model", "utf8");
    const written = await writeVoiceCaptureProfile({
      repoRoot,
      modelPath,
      label: "pilot",
      termsPrompt: "KVDS, LIG, SE50",
    });
    assert.equal(
      normalizePath(written.config_path).endsWith("_workspaces/system/voice_capture/config/voice_capture.profile.json"),
      true,
    );

    const loaded = await loadVoiceCaptureProfile("_workspaces/system/voice_capture/config/voice_capture.profile.json", {
      repoRoot,
    });
    assert.equal(loaded.profile.model_path, modelPath);

    const options = profileToSessionOptions(loaded.profile, { dryRun: true });
    assert.equal(options.label, "pilot");
    assert.equal(options.untilStopped, true);
    assert.match(options.recordCmd, /ffmpeg/);
    assert.match(options.asrCmd, /whisper-cli/);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("preflight reports executable and model readiness without running capture", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-voice-preflight-"));
  try {
    const modelPath = path.join(repoRoot, "ggml-test.bin");
    await writeFile(modelPath, "model", "utf8");
    const report = buildPreflightReport({
      recordCmd: "ffmpeg -f avfoundation -i ':0' -t {duration} {audio}",
      asrCmd: "whisper-cli -m /models/model.bin -f {audio}",
      modelPath,
      toolCheck: (commandName) => ({ ok: true, resolved_path: `/usr/local/bin/${commandName}` }),
    });
    assert.equal(report.ready, true);
    assert.equal(report.blockers.length, 0);

    const blocked = buildPreflightReport({
      recordCmd: "ffmpeg {audio}",
      asrCmd: "",
      modelPath: path.join(repoRoot, "missing.bin"),
      toolCheck: () => ({ ok: false, resolved_path: null }),
    });
    assert.equal(blocked.ready, false);
    assert.match(blocked.blockers.join("\n"), /missing ASR command template/);
    assert.match(blocked.blockers.join("\n"), /model file not found/);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("session status, launchd render, and workmeta draft stay metadata-only", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-voice-operational-"));
  try {
    const result = await runCaptureSession({
      repoRoot,
      label: "ops",
      now: new Date("2026-06-26T04:04:05.000Z"),
      chunkSeconds: 1,
      maxChunks: 1,
      recordCmd: nodeWriteFileCommand("{audio}", "audio"),
      asrCmd: nodeWriteFileCommand("{transcript_txt}", "sensitive-transcript"),
    });

    const status = await buildSessionStatus(result.session.session_dir);
    assert.equal(status.ok, true);
    assert.equal(status.audio_chunks, 1);
    assert.equal(status.transcript_segments, 1);
    assert.equal(status.transcript_txt_present, true);

    const launchd = await writeVoiceCaptureLaunchdPlist({
      repoRoot,
      configPath: "_workspaces/system/voice_capture/config/voice_capture.profile.json",
      outputDir: "_workspaces/system/voice_capture/launchd",
      logRoot: path.join(repoRoot, "logs"),
      label: "ai.soulforge.voice-capture.test",
    });
    const plist = await readFile(launchd.plist_path, "utf8");
    assert.match(plist, /guild-hall:voice-capture -- run --config/);
    assert.match(plist, /KeepAlive/);

    const draftPlan = await writeWorkmetaDraft({
      repoRoot,
      workmetaRoot: path.join(repoRoot, "_workmeta"),
      projectCode: "P00-000_INBOX",
      sessionDir: result.session.session_dir,
    });
    assert.equal(draftPlan.applied, false);
    assert.equal(draftPlan.raw_transcript_body_included, false);

    const applied = await writeWorkmetaDraft({
      repoRoot,
      workmetaRoot: path.join(repoRoot, "_workmeta"),
      projectCode: "P00-000_INBOX",
      sessionDir: result.session.session_dir,
      apply: true,
    });
    assert.equal(applied.applied, true);
    const manifest = await readFile(path.join(applied.target_dir, "source_event_manifest.yaml"), "utf8");
    assert.match(manifest, /raw_transcript_body_included: false/);
    assert.equal(manifest.includes("sensitive-transcript"), false);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("recording library registration writes metadata-only global and route indexes", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-voice-library-"));
  try {
    const result = await runCaptureSession({
      repoRoot,
      label: "library",
      now: new Date("2026-06-26T04:04:05.000Z"),
      chunkSeconds: 1,
      maxChunks: 1,
      recordCmd: nodeWriteFileCommand("{audio}", "audio"),
      asrCmd: nodeWriteFileCommand("{transcript_txt}", "sensitive-transcript"),
    });

    const planned = await writeRecordingLibraryEntry({
      repoRoot,
      sessionDir: result.session.session_dir,
      projectCode: "P00-000_INBOX",
    });
    assert.equal(planned.applied, false);
    assert.equal(planned.apply_ready, true);
    assert.equal(planned.entry.raw_payload_boundary.public_git_raw_payload_allowed, false);

    const applied = await writeRecordingLibraryEntry({
      repoRoot,
      sessionDir: result.session.session_dir,
      projectCode: "P00-000_INBOX",
      meetingType: "team_meeting",
      meetingLabelKo: "팀회의",
      apply: true,
    });
    assert.equal(applied.applied, true);

    const recordingManifest = await readFile(applied.recording_manifest_path, "utf8");
    assert.match(recordingManifest, /"project_code_candidate": "P00-000_INBOX"/);
    assert.match(recordingManifest, /"meeting_type": "team_meeting"/);
    assert.equal(recordingManifest.includes("sensitive-transcript"), false);

    const globalIndex = await readFile(applied.global_index_path, "utf8");
    assert.match(globalIndex, /20260626_130405_library/);
    assert.equal(globalIndex.includes("sensitive-transcript"), false);

    const currentIndex = await readFile(applied.current_index_path, "utf8");
    assert.match(currentIndex, /"recording_count": 1/);
    assert.equal(currentIndex.includes("sensitive-transcript"), false);

    const projectRoute = await readFile(applied.project_route_path, "utf8");
    assert.match(projectRoute, /"route_status": "unclassified_needs_owner_confirmation"/);
    assert.equal(projectRoute.includes("sensitive-transcript"), false);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("recording library preserves transcript-only and source-provided speaker state", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-voice-transcript-only-"));
  try {
    const sessionDir = path.join(
      repoRoot,
      "_workspaces",
      "system",
      "voice_capture",
      "sessions",
      "2026-07-10",
      "transcript-only",
    );
    await mkdir(sessionDir, { recursive: true });
    await writeFile(
      path.join(sessionDir, "session_manifest.json"),
      JSON.stringify({
        session_id: "transcript-only",
        source: "chatgpt_record_share_import",
        speaker_diarization: {
          status: "source_provided_labels_unverified",
          speaker_count_hint: 4,
        },
      }),
      "utf8",
    );
    await writeFile(path.join(sessionDir, "source_event_draft.yaml"), "source_kind: chatgpt_record_share_import\n", "utf8");
    await writeFile(path.join(sessionDir, "transcript.txt"), "[1] speaker 1: transcript only\n", "utf8");

    const planned = await writeRecordingLibraryEntry({ repoRoot, sessionDir });

    assert.equal(planned.entry.raw_payload_boundary.audio_stored_under_workspace, false);
    assert.equal(planned.entry.raw_payload_boundary.transcript_stored_under_workspace, true);
    assert.equal(planned.entry.speaker_diarization.status, "source_provided_labels_unverified");
    assert.equal(planned.entry.speaker_diarization.speaker_count_hint, 4);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

function nodeWriteFileCommand(targetPlaceholder, content) {
  const script = "require('node:fs').writeFileSync(process.argv[1],process.argv[2])";
  return `${shellQuote(process.execPath)} -e ${shellQuote(script)} ${targetPlaceholder} ${shellQuote(content)}`;
}

function normalizePath(value) {
  return String(value).split(path.sep).join("/");
}

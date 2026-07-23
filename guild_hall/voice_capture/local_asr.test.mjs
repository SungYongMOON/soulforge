import assert from "node:assert/strict";
import crypto from "node:crypto";
import { writeFileSync } from "node:fs";
import { mkdtemp, mkdir, readFile, readdir, rm, stat, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  analyzeLocalAsrBacklog,
  analyzeLocalAsrSession,
  analyzeBoundedStrongAsrWindows,
  buildChunkWindows,
  buildDefaultLocalAsrProfile,
  buildLocalAsrPreflight,
  buildTranscriptQualityMetrics,
  discoverLocalAsrSessions,
  drainLocalAsrQueue,
  emitVoiceTranscriptionCompleted,
  enqueueLocalAsrBacklog,
  parseWhisperJson,
  prepareBoundedStrongAsrRequest,
  renderVoiceTranscriptionCompletedMessage,
  suppressRepetitiveSegments,
  validateBoundedStrongAsrRequest,
  validateBoundedStrongAsrRevision,
  voiceTranscriptionCompletedEvent,
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
      { offsets: { from: 2000, to: 4000 }, text: "유효 구간", tokens: [{ p: 0.9 }, { p: 0.4 }] },
      { offsets: { from: 12000, to: 12000 }, text: "다음 구간" },
    ],
  }, window, { runId: "fixture" });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].start_seconds, 10);
  assert.equal(rows[0].end_seconds, 12);
  assert.equal(rows[0].speaker, "UNKNOWN");
  assert.equal(rows[0].analysis_run_id, "fixture");
  assert.deepEqual(rows[0].asr_confidence, {
    state: "available_uncalibrated",
    token_probability_count: 2,
    mean_token_probability: 0.65,
    minimum_token_probability: 0.4,
    low_probability_token_count: 1,
  });
});

test("local ASR parser rejects non-finite, reversed, negative, and out-of-window segment offsets", () => {
  const window = {
    chunk_index: 1,
    nominal_start_seconds: 10,
    nominal_end_seconds: 40,
    extract_start_seconds: 10,
    extract_duration_seconds: 30,
  };
  for (const offsets of [
    { from: "NaN", to: 1000 },
    { from: -1, to: 1000 },
    { from: 2000, to: 1000 },
    { from: 0, to: 30001 },
  ]) {
    assert.throws(
      () => parseWhisperJson({ transcription: [{ offsets, text: "synthetic" }] }, window),
      /finite, ordered, and contained/u,
    );
  }
  assert.throws(
    () => parseWhisperJson({ transcription: [] }, { ...window, extract_duration_seconds: Number.NaN }),
    /chunk window bounds are invalid/u,
  );
});

test("local ASR repetition filter keeps one nearby phrase and exposes aggregate quality flags", () => {
  const segments = [
    { start_seconds: 0, end_seconds: 2, content: "반복 문장" },
    { start_seconds: 10, end_seconds: 12, content: " 반복   문장 " },
    { start_seconds: 20, end_seconds: 22, content: "다른 문장" },
    { start_seconds: 120, end_seconds: 122, content: "반복 문장" },
  ];
  const filtered = suppressRepetitiveSegments(segments, {
    enabled: true,
    minimum_text_characters: 4,
    lookback_seconds: 90,
  });
  assert.deepEqual(filtered.kept.map((row) => row.start_seconds), [0, 20, 120]);
  assert.equal(filtered.suppressed.length, 1);
  assert.equal(filtered.suppressed[0].suppression_reason, "exact_text_repeat_within_lookback");
  assert.deepEqual(buildTranscriptQualityMetrics(filtered.kept, filtered.suppressed), {
    raw_segment_count: 4,
    retained_segment_count: 3,
    suppressed_segment_count: 1,
    unique_raw_text_count: 2,
    suppressed_segment_ratio: 0.25,
    token_probability_state: "unavailable",
    token_probability_count: 0,
    mean_token_probability: null,
    low_probability_token_count: 0,
    low_probability_token_ratio: null,
    flags: [],
  });
});

test("voice transcription completion brief excludes transcript text and records queue metadata", async () => {
  const sessionManifest = {
    recorded_at_local: "2026-07-11T20:25:20+09:00",
    duration_seconds: 92,
  };
  const analysisManifest = {
    segment_count: 3,
    transcript_jsonl_ref: "_workspaces/system/voice_capture/sessions/fixture/transcript.jsonl",
  };
  const message = renderVoiceTranscriptionCompletedMessage(sessionManifest, analysisManifest);
  assert.match(message, /로컬 전사가 완료되었습니다/u);
  assert.match(message, /녹음 길이: 1분 32초/u);
  assert.match(message, /전사 구간: 3개/u);
  assert.equal(message.includes("전사 본문 비밀 문장"), false);

  const calls = [];
  const notification = await emitVoiceTranscriptionCompleted("/repo", sessionManifest, analysisManifest, {
    notificationEmitter: async (repoRoot, payload) => {
      calls.push({ repoRoot, payload });
      return { ok: true, status: "queued", request_id: "notify-fixture" };
    },
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].payload.event, voiceTranscriptionCompletedEvent);
  assert.equal(calls[0].payload.scope, "gateway");
  assert.equal(calls[0].payload.text.includes("전사 본문 비밀 문장"), false);
  assert.deepEqual(notification, {
    event: voiceTranscriptionCompletedEvent,
    state: "queued",
    queued: true,
    request_id: "notify-fixture",
    raw_transcript_included: false,
  });
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
    const notificationCalls = [];
    const deliveryCalls = [];

    const result = await analyzeLocalAsrSession({
      repoRoot,
      profile,
      sessionDir: fixture.sessionDir,
      apply: true,
      commandRunner,
      notificationEmitter: async (root, payload) => {
        notificationCalls.push({ root, payload });
        return { ok: true, status: "queued", request_id: "notify-local-asr-fixture" };
      },
      deliveryReceiptEmitter: async (options) => {
        deliveryCalls.push(options);
        return { status: "ready", receipt_ref: "_workspaces/system/voice_capture/delivery/producer_receipts/fixture_session.json" };
      },
    });
    assert.equal(result.state, "completed");
    assert.equal(result.segment_count, 2);
    assert.equal(result.provider_transcript_used_as_input, false);
    assert.equal(result.notification.state, "queued");
    assert.equal(result.delivery.state, "ready");
    assert.equal(deliveryCalls.length, 1);
    assert.equal(deliveryCalls[0].stage, "local_asr_ready");
    assert.equal(deliveryCalls[0].apply, true);
    assert.equal(notificationCalls.length, 1);
    assert.equal(notificationCalls[0].payload.event, voiceTranscriptionCompletedEvent);
    assert.equal(notificationCalls[0].payload.text.includes("첫 구간"), false);
    assert.equal(notificationCalls[0].payload.text.includes("둘째 구간"), false);
    assert.equal(calls.filter((row) => row.command === profile.ffmpeg_binary).length, 2);
    assert.equal(calls.filter((row) => row.command === profile.asr_binary).length, 2);
    const whisperArgs = calls.find((row) => row.command === profile.asr_binary).args;
    assert.equal(whisperArgs.includes("--vad"), true);
    assert.equal(whisperArgs.includes("-nf"), true);
    assert.equal(whisperArgs.includes("-sns"), true);
    assert.equal(whisperArgs.includes("-ojf"), true);
    assert.equal(whisperArgs[whisperArgs.indexOf("-mc") + 1], "0");

    const providerTranscript = await readFile(path.join(fixture.sessionDir, "transcript.txt"), "utf8");
    assert.equal(providerTranscript, "provider transcript must stay unchanged\n");
    const outputDir = path.join(fixture.sessionDir, profile.output_subdir, profile.run_id);
    const transcriptRows = (await readFile(path.join(outputDir, "transcript.jsonl"), "utf8"))
      .trim().split("\n").map((line) => JSON.parse(line));
    assert.deepEqual(transcriptRows.map((row) => row.content), ["첫 구간", "둘째 구간"]);
    assert.deepEqual(transcriptRows.map((row) => row.segment_id), [1, 2]);
    assert.equal(result.quality_metrics.suppressed_segment_count, 0);
    assert.equal(await readFile(path.join(outputDir, "suppressed_segments.jsonl"), "utf8"), "");

    const contextSource = JSON.parse(await readFile(path.join(outputDir, "project_context_source.json"), "utf8"));
    assert.equal(contextSource.source_kind, "voice");
    assert.deepEqual(contextSource.companion_input_kinds, ["mail", "se_schedule"]);
    assert.equal(contextSource.raw_payload_copied, false);
    const contextEvent = JSON.parse(await readFile(path.join(outputDir, "project_context_event.json"), "utf8"));
    assert.equal(contextEvent.events.length, 1);
    assert.equal(contextEvent.events[0].source_kind, "voice");
    assert.equal(contextEvent.events[0].project_code, "P00-000_INBOX");
    assert.equal(contextEvent.events[0].action_required, false);
    assert.equal(Object.hasOwn(contextEvent.events[0], "transcript_body"), false);

    const manifest = JSON.parse(await readFile(path.join(fixture.sessionDir, "session_manifest.json"), "utf8"));
    assert.equal(manifest.independent_transcription.status, "completed");
    assert.equal(manifest.independent_transcription.speaker_identity_verified, false);
    assert.equal(manifest.independent_transcription.notification.state, "queued");
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("local ASR delivery receipt failure is retryable and does not roll back completion", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-local-asr-delivery-warning-"));
  try {
    const fixture = await createSessionFixture(repoRoot);
    const profile = {
      ...buildDefaultLocalAsrProfile(),
      model_path: "model.bin",
      run_id: "fixture_run_delivery_warning",
      chunk_seconds: 30,
      overlap_seconds: 0,
    };
    await writeFile(path.join(repoRoot, "model.bin"), "model", "utf8");
    const result = await analyzeLocalAsrSession({
      repoRoot,
      profile,
      sessionDir: fixture.sessionDir,
      apply: true,
      commandRunner: commandFixture([]),
      notificationEmitter: async () => ({ ok: true, status: "queued", request_id: "notify-warning-fixture" }),
      deliveryReceiptEmitter: async () => {
        throw new Error("synthetic delivery failure");
      },
    });
    assert.equal(result.state, "completed");
    assert.equal(result.delivery.state, "prepare_failed_retryable");
    assert.equal(result.delivery.warning, "delivery_receipt_prepare_failed_retryable");
    const manifest = JSON.parse(await readFile(path.join(fixture.sessionDir, "session_manifest.json"), "utf8"));
    assert.equal(manifest.independent_transcription.status, "completed");
    assert.equal(manifest.independent_transcription.delivery_warning, "delivery_receipt_prepare_failed_retryable");
    const analysis = JSON.parse(await readFile(path.join(fixture.sessionDir, profile.output_subdir, profile.run_id, "analysis_manifest.json"), "utf8"));
    assert.equal(analysis.state, "completed");
    assert.equal(analysis.delivery_warning, "delivery_receipt_prepare_failed_retryable");
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("local ASR queue resumes a completed transcript without rerunning audio and retries an unsent notification", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-local-asr-resume-"));
  try {
    const fixture = await createSessionFixture(repoRoot);
    const profile = {
      ...buildDefaultLocalAsrProfile(),
      model_path: "model.bin",
      run_id: "fixture_run_resume",
      chunk_seconds: 30,
      overlap_seconds: 0,
    };
    await writeFile(path.join(repoRoot, "model.bin"), "model", "utf8");
    await analyzeLocalAsrSession({
      repoRoot,
      profile,
      sessionDir: fixture.sessionDir,
      apply: true,
      commandRunner: commandFixture([]),
      notificationEmitter: async () => ({ ok: true, status: "disabled" }),
      deliveryReceiptEmitter: async () => ({ status: "ready", receipt_ref: "fixture-receipt" }),
    });
    const analysisPath = path.join(fixture.sessionDir, profile.output_subdir, profile.run_id, "analysis_manifest.json");
    const interrupted = JSON.parse(await readFile(analysisPath, "utf8"));
    await writeFile(analysisPath, `${JSON.stringify({
      ...interrupted,
      state: "in_progress",
      transcript_ref: null,
      transcript_jsonl_ref: null,
    })}\n`, "utf8");
    const queueDir = path.join(repoRoot, profile.queue_root);
    const queuePath = path.join(queueDir, "pending", "fixture_session.json");
    await mkdir(path.dirname(queuePath), { recursive: true });
    await writeFile(queuePath, `${JSON.stringify({
      schema_version: "soulforge.local_asr_queue_item.v0",
      session_id: "fixture_session",
      session_ref: path.relative(repoRoot, fixture.sessionDir).split(path.sep).join("/"),
    })}\n`, "utf8");

    const commands = [];
    const notifications = [];
    const result = await drainLocalAsrQueue({
      repoRoot,
      profile,
      apply: true,
      now: new Date("2026-07-13T01:00:00Z"),
      commandRunner: commandFixture(commands),
      notificationEmitter: async () => {
        notifications.push("retried");
        return { ok: true, status: "queued", request_id: "notify-resumed" };
      },
      deliveryReceiptEmitter: async () => ({ status: "ready", receipt_ref: "fixture-receipt" }),
    });
    assert.equal(result.processed_count, 1);
    assert.equal(result.remaining_pending_count, 0);
    assert.equal(commands.length, 0);
    assert.deepEqual(notifications, ["retried"]);
    const processedPath = path.join(queueDir, "processed", "2026-07-13", "fixture_session.json");
    assert.equal(await readFile(processedPath, "utf8").then(() => true), true);
    const recovered = JSON.parse(await readFile(analysisPath, "utf8"));
    assert.equal(recovered.recovered_from_completed_session_manifest, true);
    const manifest = JSON.parse(await readFile(path.join(fixture.sessionDir, "session_manifest.json"), "utf8"));
    assert.equal(manifest.independent_transcription.notification.state, "queued");
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("local ASR does not reuse completed output across run, model, or source identity changes", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-local-asr-identity-"));
  try {
    const fixture = await createSessionFixture(repoRoot);
    const originalProfile = {
      ...buildDefaultLocalAsrProfile(),
      model_path: "model.bin",
      model_id: "fixture-model-old",
      run_id: "fixture_run_old",
      chunk_seconds: 30,
      overlap_seconds: 0,
    };
    await writeFile(path.join(repoRoot, "model.bin"), "model", "utf8");
    await analyzeLocalAsrSession({
      repoRoot,
      profile: originalProfile,
      sessionDir: fixture.sessionDir,
      apply: true,
      commandRunner: commandFixture([]),
      notificationEmitter: async () => ({ ok: true, status: "disabled" }),
      deliveryReceiptEmitter: async () => ({ status: "ready", receipt_ref: "fixture-receipt" }),
    });

    const changedRunProfile = {
      ...originalProfile,
      model_id: "fixture-model-new",
      run_id: "fixture_run_new",
    };
    const changedRunCommands = [];
    const changedRun = await analyzeLocalAsrSession({
      repoRoot,
      profile: changedRunProfile,
      sessionDir: fixture.sessionDir,
      apply: true,
      commandRunner: commandFixture(changedRunCommands),
      notificationEmitter: async () => ({ ok: true, status: "disabled" }),
      deliveryReceiptEmitter: async () => ({ status: "ready", receipt_ref: "fixture-receipt" }),
    });
    assert.equal(changedRun.resumed_completed, undefined);
    assert.equal(changedRun.run_id, changedRunProfile.run_id);
    assert.equal(changedRunCommands.length > 0, true);

    const manifestPath = path.join(fixture.sessionDir, "session_manifest.json");
    const changedSourceManifest = JSON.parse(await readFile(manifestPath, "utf8"));
    changedSourceManifest.source_sha256 = "fixture-audio-sha-new";
    changedSourceManifest.audio.sha256 = "fixture-audio-sha-new";
    await writeFile(manifestPath, `${JSON.stringify(changedSourceManifest, null, 2)}\n`, "utf8");

    const changedSourceCommands = [];
    const changedSource = await analyzeLocalAsrSession({
      repoRoot,
      profile: changedRunProfile,
      sessionDir: fixture.sessionDir,
      apply: true,
      commandRunner: commandFixture(changedSourceCommands),
      notificationEmitter: async () => ({ ok: true, status: "disabled" }),
      deliveryReceiptEmitter: async () => ({ status: "ready", receipt_ref: "fixture-receipt" }),
    });
    assert.equal(changedSource.resumed_completed, undefined);
    assert.equal(changedSource.source_sha256, "fixture-audio-sha-new");
    assert.equal(changedSourceCommands.length > 0, true);
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
    assert.equal(queue.session_ref, path.relative(repoRoot, fixture.sessionDir).split(path.sep).join("/"));
    assert.equal(queue.raw_payload_copied, false);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("local ASR preflight checks engine, ffmpeg, and model without reading source payload", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-local-asr-preflight-"));
  try {
    await writeFile(path.join(repoRoot, "model.bin"), "model", "utf8");
    await writeFile(path.join(repoRoot, "vad.bin"), "vad", "utf8");
    const profile = {
      ...buildDefaultLocalAsrProfile(),
      asr_binary: process.execPath,
      ffmpeg_binary: process.execPath,
      model_path: "model.bin",
      model_sha1: null,
      vad: {
        ...buildDefaultLocalAsrProfile().vad,
        model_path: "vad.bin",
        model_sha256: null,
      },
    };
    const report = await buildLocalAsrPreflight({ repoRoot, profile });
    assert.equal(report.ok, true);
    assert.equal(report.blockers.length, 0);
    assert.equal(report.checks.some((row) => row.id === "vad_model_present" && row.ok), true);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("bounded strong ASR is feature-OFF before it reads a request or source", async () => {
  const result = await analyzeBoundedStrongAsrWindows({
    repoRoot: path.join(os.tmpdir(), "does-not-exist"),
    profile: buildDefaultLocalAsrProfile(),
    requestPath: path.join(os.tmpdir(), "does-not-exist", "request.json"),
    apply: true,
  });
  assert.equal(result.state, "disabled");
  assert.equal(result.feature_enabled, false);
  assert.equal(result.audio_payload_read, false);
  assert.equal(result.provider_payload_read, false);
  assert.equal(result.canonical_whole_session_pointer_replaced, false);
});

test("bounded strong request is derived from the bound fast semantic selection and rejects unsafe windows", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-bounded-strong-request-"));
  try {
    const fixture = await createBoundedStrongFixture(repoRoot);
    const semantic = boundedSemanticSelection(fixture.fast, [
      boundedWindow("1", 10, 30),
    ]);
    const prepared = await prepareBoundedStrongAsrRequest({
      repoRoot,
      fastAnalysisManifestPath: fixture.fastManifestPath,
      semanticRun: semantic,
      approvedBy: "owner_review",
      now: new Date("2026-07-23T01:00:00.000Z"),
      apply: true,
      windows: [boundedWindow("9", 70, 30)],
    });
    assert.equal(prepared.applied, true);
    assert.deepEqual(prepared.request.windows.map((window) => window.start_seconds), [10]);
    assert.equal(validateBoundedStrongAsrRequest(prepared.request).ok, true);
    assert.equal(prepared.request.fast_analysis_manifest_sha256, sha256(await readFile(fixture.fastManifestPath)));
    assert.equal(prepared.request.source_sha256, fixture.sourceSha256);
    assert.equal(prepared.request.project_route_state, "candidate_only");

    const coalesced = await prepareBoundedStrongAsrRequest({
      repoRoot,
      fastAnalysisManifestPath: fixture.fastManifestPath,
      semanticRun: boundedSemanticSelection(fixture.fast, [
        boundedWindow("2", 0, 90),
        boundedWindow("3", 60, 60),
      ]),
      approvedBy: "owner_review",
    });
    assert.deepEqual(
      coalesced.request.windows.map((window) => [window.start_seconds, window.duration_seconds]),
      [[0, 60], [60, 60]],
    );
    assert.equal(new Set(coalesced.request.windows.map((window) => window.window_id)).size, 2);

    const endClamped = await prepareBoundedStrongAsrRequest({
      repoRoot,
      fastAnalysisManifestPath: fixture.fastManifestPath,
      semanticRun: boundedSemanticSelection(fixture.fast, [
        boundedWindow("4", 100, 30),
      ]),
      approvedBy: "owner_review",
    });
    assert.deepEqual(
      endClamped.request.windows.map((window) => [window.start_seconds, window.duration_seconds]),
      [[90, 30]],
    );
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("bounded strong ASR rejects request and revision write parents linked outside session custody", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "soulforge-bounded-strong-custody-"));
  try {
    const requestRepo = path.join(root, "request-repo");
    await mkdir(requestRepo);
    const requestFixture = await createBoundedStrongFixture(requestRepo);
    const requestOutside = path.join(root, "request-outside");
    await mkdir(requestOutside);
    try {
      await symlink(
        requestOutside,
        path.join(requestFixture.sessionDir, "analysis", "strong_asr_requests"),
        process.platform === "win32" ? "junction" : "dir",
      );
    } catch (error) {
      if (error?.code === "EPERM") {
        t.skip("directory links are unavailable in this environment");
        return;
      }
      throw error;
    }
    await assert.rejects(
      prepareBoundedStrongAsrRequest({
        repoRoot: requestRepo,
        fastAnalysisManifestPath: requestFixture.fastManifestPath,
        semanticRun: boundedSemanticSelection(requestFixture.fast, [boundedWindow("6", 10, 30)]),
        approvedBy: "owner_review",
        apply: true,
      }),
      /writable (?:parent|ancestor) is outside approved custody/u,
    );
    assert.deepEqual(await readdir(requestOutside), []);

    const revisionRepo = path.join(root, "revision-repo");
    await mkdir(revisionRepo);
    const revisionFixture = await createBoundedStrongFixture(revisionRepo);
    const prepared = await prepareBoundedStrongAsrRequest({
      repoRoot: revisionRepo,
      fastAnalysisManifestPath: revisionFixture.fastManifestPath,
      semanticRun: boundedSemanticSelection(revisionFixture.fast, [boundedWindow("7", 10, 30)]),
      approvedBy: "owner_review",
      apply: true,
    });
    const profile = {
      ...buildDefaultLocalAsrProfile(),
      vad: { ...buildDefaultLocalAsrProfile().vad, enabled: false },
      bounded_strong_asr: {
        ...buildDefaultLocalAsrProfile().bounded_strong_asr,
        enabled: true,
        model_path: "_workspaces/system/voice_capture/models/ggml-large-v3-q5_0.bin",
        model_sha1: "1".repeat(40),
      },
    };
    await mkdir(path.join(revisionRepo, "_workspaces", "system", "voice_capture", "models"), { recursive: true });
    await writeFile(path.join(revisionRepo, profile.bounded_strong_asr.model_path), "synthetic model", "utf8");
    const inspectStrongModel = async () => ({
      size: 15,
      sha1: profile.bounded_strong_asr.model_sha1,
      sha256: profile.bounded_strong_asr.model_sha256,
    });
    const planned = await analyzeBoundedStrongAsrWindows({
      repoRoot: revisionRepo,
      profile,
      requestPath: path.join(revisionRepo, prepared.request_ref),
      testHooks: { inspectStrongModel },
    });
    const revisionOutside = path.join(root, "revision-outside");
    await mkdir(revisionOutside);
    await symlink(
      revisionOutside,
      path.join(revisionRepo, planned.output_ref),
      process.platform === "win32" ? "junction" : "dir",
    );
    await assert.rejects(
      analyzeBoundedStrongAsrWindows({
        repoRoot: revisionRepo,
        profile,
        requestPath: path.join(revisionRepo, prepared.request_ref),
        apply: true,
        testHooks: { inspectStrongModel },
      }),
      /writable (?:parent|ancestor) is outside approved custody/u,
    );
    assert.deepEqual(await readdir(revisionOutside), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("bounded strong ASR appends one immutable revision and exact retry preserves the canonical session pointer", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-bounded-strong-run-"));
  try {
    const fixture = await createBoundedStrongFixture(repoRoot);
    const prepared = await prepareBoundedStrongAsrRequest({
      repoRoot,
      fastAnalysisManifestPath: fixture.fastManifestPath,
      semanticRun: boundedSemanticSelection(fixture.fast, [boundedWindow("5", 10, 30)]),
      approvedBy: "owner_review",
      now: new Date("2026-07-23T01:00:00.000Z"),
      apply: true,
    });
    await createBoundedContinuityMetadata(repoRoot, fixture);
    const profile = {
      ...buildDefaultLocalAsrProfile(),
      ffmpeg_binary: "ffmpeg",
      asr_binary: "whisper-cli",
      vad: { ...buildDefaultLocalAsrProfile().vad, enabled: false },
      bounded_strong_asr: {
        ...buildDefaultLocalAsrProfile().bounded_strong_asr,
        enabled: true,
        model_path: "_workspaces/system/voice_capture/models/ggml-large-v3-q5_0.bin",
        model_sha1: "1".repeat(40),
      },
    };
    await assert.rejects(
      analyzeBoundedStrongAsrWindows({
        repoRoot,
        profile: { ...profile, output_subdir: "analysis/local_asr/../../escape" },
        requestPath: path.join(repoRoot, prepared.request_ref),
        apply: true,
      }),
      /output_subdir must be exactly analysis\/local_asr/u,
    );
    await mkdir(path.join(repoRoot, "_workspaces", "system", "voice_capture", "models"), { recursive: true });
    await writeFile(path.join(repoRoot, profile.bounded_strong_asr.model_path), "synthetic model", "utf8");
    const beforeSession = await readFile(fixture.sessionManifestPath);
    const calls = [];
    const inspectStrongModel = async () => ({
      size: 15,
      sha1: profile.bounded_strong_asr.model_sha1,
      sha256: profile.bounded_strong_asr.model_sha256,
    });
    const tempPrefix = "soulforge-bounded-strong-asr-";
    const tempBefore = new Set((await readdir(os.tmpdir())).filter((name) => name.startsWith(tempPrefix)));
    const failedCalls = [];
    const fixtureRunner = boundedStrongCommandFixture(failedCalls);
    await assert.rejects(
      analyzeBoundedStrongAsrWindows({
        repoRoot,
        profile,
        requestPath: path.join(repoRoot, prepared.request_ref),
        apply: true,
        now: new Date("2026-07-23T01:04:00.000Z"),
        commandRunner(command, args) {
          if (command === "whisper-cli") {
            failedCalls.push({ command, args: [...args] });
            throw new Error("whisper.cpp synthetic retryable failure");
          }
          return fixtureRunner(command, args);
        },
        testHooks: { inspectStrongModel },
      }),
      /synthetic retryable failure/u,
    );
    const tempAfter = new Set((await readdir(os.tmpdir())).filter((name) => name.startsWith(tempPrefix)));
    assert.deepEqual(tempAfter, tempBefore);
    assert.deepEqual(await readFile(fixture.sessionManifestPath), beforeSession);

    const first = await analyzeBoundedStrongAsrWindows({
      repoRoot,
      profile,
      requestPath: path.join(repoRoot, prepared.request_ref),
      apply: true,
      now: new Date("2026-07-23T01:05:00.000Z"),
      commandRunner: boundedStrongCommandFixture(calls),
      testHooks: { inspectStrongModel },
    });
    assert.equal(first.state, "completed");
    assert.equal(first.resumed_completed, false);
    assert.equal(first.approved_window_count, 1);
    assert.equal(first.hpp_continuity_state, "complete");
    assert.equal(first.canonical_whole_session_pointer_replaced, false);
    assert.equal(first.delivery_receipt_replaced, false);
    assert.equal(first.completion_notification_emitted, false);
    assert.deepEqual(await readFile(fixture.sessionManifestPath), beforeSession);

    const manifestPath = path.join(repoRoot, first.analysis_manifest_ref);
    const manifestBytes = await readFile(manifestPath);
    const manifestMtime = (await stat(manifestPath)).mtimeMs;
    const manifest = JSON.parse(manifestBytes.toString("utf8"));
    assert.equal(validateBoundedStrongAsrRevision(manifest).ok, true);
    assert.equal(manifest.revision.append_only, true);
    assert.equal(manifest.revision.coverage_scope, "approved_windows_only");
    assert.equal(manifest.revision.canonical_status, "non_canonical_revision");
    assert.match(manifest.revision.execution_config_sha256, /^[a-f0-9]{64}$/u);
    assert.equal(manifest.recorded_at_local, "2026-07-23T09:00:00+09:00");
    const transcriptRows = (await readFile(path.join(path.dirname(manifestPath), "transcript.jsonl"), "utf8"))
      .trim().split("\n").filter(Boolean).map((line) => JSON.parse(line));
    assert.equal(transcriptRows.length, 1);
    assert.equal(transcriptRows[0].start_seconds, 12);
    assert.equal(transcriptRows[0].end_seconds, 14);
    assert.deepEqual((await readdir(path.join(path.dirname(manifestPath), "chunks"))).sort(), [
      "chunk_00001.complete.json",
      "chunk_00001.json",
      "chunk_00001.srt",
      "chunk_00001.txt",
    ]);
    assert.equal(calls.filter((call) => call.command === "whisper-cli").length, 1);

    const retryCalls = [];
    const retry = await analyzeBoundedStrongAsrWindows({
      repoRoot,
      profile,
      requestPath: path.join(repoRoot, prepared.request_ref),
      apply: true,
      now: new Date("2026-07-23T02:05:00.000Z"),
      commandRunner: boundedStrongCommandFixture(retryCalls),
      testHooks: { inspectStrongModel },
    });
    assert.equal(retry.resumed_completed, true);
    assert.equal(retry.revision_id, first.revision_id);
    assert.deepEqual(retryCalls, []);
    assert.deepEqual(await readFile(manifestPath), manifestBytes);
    assert.equal((await stat(manifestPath)).mtimeMs, manifestMtime);
    assert.deepEqual(await readFile(fixture.sessionManifestPath), beforeSession);
    const runDirs = await readdir(path.join(fixture.sessionDir, "analysis", "local_asr"));
    assert.equal(runDirs.filter((name) => name.startsWith("bounded_large-v3_")).length, 1);
    const continuity = JSON.parse(await readFile(path.join(path.dirname(manifestPath), "hpp_continuity_receipt.json"), "utf8"));
    assert.equal(continuity.state, "complete");
    assert.equal(continuity.boundaries.metadata_only, true);
    assert.equal(continuity.boundaries.transcript_body_copied, false);
    assert.equal(continuity.boundaries.audio_body_copied, false);
    assert.equal(JSON.stringify(continuity).includes("FIXTURE_SEGMENT"), false);

    const changedConfigCalls = [];
    const changedConfig = await analyzeBoundedStrongAsrWindows({
      repoRoot,
      profile: { ...profile, terms_prompt: "fixture-config-change" },
      requestPath: path.join(repoRoot, prepared.request_ref),
      apply: true,
      now: new Date("2026-07-23T03:05:00.000Z"),
      commandRunner: boundedStrongCommandFixture(changedConfigCalls),
      testHooks: { inspectStrongModel },
    });
    assert.notEqual(changedConfig.revision_id, first.revision_id);
    assert.equal(changedConfigCalls.filter((call) => call.command === "whisper-cli").length, 1);
    assert.deepEqual(await readFile(fixture.sessionManifestPath), beforeSession);
    const changedRunDirs = await readdir(path.join(fixture.sessionDir, "analysis", "local_asr"));
    assert.equal(changedRunDirs.filter((name) => name.startsWith("bounded_large-v3_")).length, 2);
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

async function createBoundedStrongFixture(repoRoot) {
  const sessionDir = path.join(
    repoRoot,
    "_workspaces",
    "system",
    "voice_capture",
    "sessions",
    "2026-07-23",
    "bounded_fixture_session",
  );
  const sessionRef = path.relative(repoRoot, sessionDir).split(path.sep).join("/");
  const audioRef = `${sessionRef}/audio/source.ogg`;
  const fastRunId = "whispercpp_large-v3-turbo-q5_0_fixture";
  const fastOutputRef = `${sessionRef}/analysis/local_asr/${fastRunId}`;
  const fastManifestPath = path.join(repoRoot, fastOutputRef, "analysis_manifest.json");
  const fastTranscriptRef = `${fastOutputRef}/transcript.txt`;
  const fastTranscriptJsonlRef = `${fastOutputRef}/transcript.jsonl`;
  await mkdir(path.join(sessionDir, "audio"), { recursive: true });
  await mkdir(path.dirname(fastManifestPath), { recursive: true });
  await writeFile(path.join(repoRoot, audioRef), Buffer.from([0, 1, 2, 3]));
  await writeFile(path.join(repoRoot, fastTranscriptRef), "", "utf8");
  await writeFile(path.join(repoRoot, fastTranscriptJsonlRef), "", "utf8");
  const sourceSha256 = sha256(Buffer.from([0, 1, 2, 3]));
  const fast = {
    schema_version: "soulforge.local_asr_run.v0",
    state: "completed",
    session_id: "bounded_fixture_session",
    session_ref: sessionRef,
    source_audio_ref: audioRef,
    source_sha256: sourceSha256,
    run_id: fastRunId,
    engine: "whisper.cpp",
    model_id: "large-v3-turbo-q5_0",
    model_sha1: "2".repeat(40),
    model_ref: "_workspaces/system/voice_capture/models/fast.bin",
    evidence_role: "independent_machine_transcript_unverified",
    transcript_ref: fastTranscriptRef,
    transcript_jsonl_ref: fastTranscriptJsonlRef,
    transcript_sha256: sha256(Buffer.alloc(0)),
    segment_count: 0,
    chunk_count: 1,
  };
  await writeFile(fastManifestPath, `${JSON.stringify(fast, null, 2)}\n`, "utf8");
  const sessionManifestPath = path.join(sessionDir, "session_manifest.json");
  await writeFile(sessionManifestPath, `${JSON.stringify({
    schema_version: "soulforge.voice_capture_session.v0",
    session_id: "bounded_fixture_session",
    recording_id: "bounded_fixture_session",
    recorded_at_local: "2026-07-23T09:00:00+09:00",
    duration_seconds: 120,
    source_sha256: sourceSha256,
    audio: { ref: audioRef, sha256: sourceSha256 },
    independent_transcription: {
      status: "completed",
      run_id: fastRunId,
      transcript_ref: fastTranscriptRef,
      transcript_jsonl_ref: fastTranscriptJsonlRef,
    },
  }, null, 2)}\n`, "utf8");
  return {
    sessionDir,
    sessionRef,
    sessionManifestPath,
    audioRef,
    sourceSha256,
    fast,
    fastManifestPath,
  };
}

function boundedWindow(seed, startSeconds, durationSeconds) {
  return {
    window_id: `vrw_${seed.repeat(24)}`,
    start_seconds: startSeconds,
    duration_seconds: durationSeconds,
    source_unit_refs: ["unit_1_1"],
    importance_state: "material_ambiguity_candidate",
    importance_reason_codes: ["speech_act_request"],
    escalation_state: "stronger_local_asr_required",
    human_listen_required: false,
    transcript_text_copied: false,
  };
}

function boundedSemanticSelection(fast, windows) {
  return {
    schema_version: "soulforge.voice_semantic_label_run.v1",
    run_id: `vsl_${"a".repeat(24)}`,
    recording_ref: {
      recording_id: fast.session_id,
      transcript_ref: fast.transcript_jsonl_ref,
      transcript_sha256: fast.transcript_sha256,
      evidence_role: fast.evidence_role,
    },
    engine: {
      engine_id: "soulforge_voice_semantic_baseline",
      engine_version: "1.10.8",
      ruleset_sha256: "b".repeat(64),
    },
    evidence_gate: {
      input_class: "independent_asr_fast",
      state: "stronger_local_asr_required",
      action_candidate_emission_allowed: false,
      project_candidate_emission_allowed: false,
    },
    review_windows: windows,
    boundaries: {
      ambiguous_trivial_content_ignored: true,
      provider_transcript_authority_zero: true,
    },
  };
}

async function createBoundedContinuityMetadata(repoRoot, fixture) {
  const libraryRef = "_workspaces/system/voice_capture/library/recordings/2026-07-23/bounded_fixture_session/recording_manifest.json";
  const libraryPath = path.join(repoRoot, libraryRef);
  await mkdir(path.dirname(libraryPath), { recursive: true });
  await writeFile(libraryPath, `${JSON.stringify({
    schema_version: "soulforge.voice_recording_library_entry.v0",
    recording_id: "bounded_fixture_session",
    session_id: "bounded_fixture_session",
    route_state: {
      project_code_candidate: "P00-000_INBOX",
      route_status: "unclassified_needs_owner_confirmation",
      accepted_project_code: null,
      accepted_by: null,
      accepted_at: null,
    },
    payload_refs: {
      session_dir: fixture.sessionRef,
      source_audio_ref: fixture.audioRef,
    },
    status_summary: { source_sha256: fixture.sourceSha256 },
    raw_payload_boundary: {
      library_raw_audio_copy_allowed: false,
      library_raw_transcript_copy_allowed: false,
    },
  }, null, 2)}\n`, "utf8");
  const sessionManifestRef = `${fixture.sessionRef}/session_manifest.json`;
  const rows = [];
  for (const [role, ref] of [
    ["recording_manifest", libraryRef],
    ["session_manifest", sessionManifestRef],
    ["source_audio", fixture.audioRef],
  ]) {
    const bytes = await readFile(path.join(repoRoot, ref));
    rows.push({
      role,
      ref,
      size_bytes: bytes.length,
      sha256: sha256(bytes),
      required: true,
    });
  }
  const receipt = {
    schema_version: "soulforge.voice_delivery_receipt.v0",
    receipt_id: `voice-delivery-${sha256(Buffer.from(JSON.stringify(rows))).slice(0, 24)}`,
    status: "ready",
    session_id: "bounded_fixture_session",
    recording_id: "bounded_fixture_session",
    stage: "local_asr_ready",
    producer_node: "hpp_voice_writer",
    created_at: "2026-07-23T00:59:00.000Z",
    files: rows,
  };
  const receiptPath = path.join(
    repoRoot,
    "_workspaces",
    "system",
    "voice_capture",
    "delivery",
    "producer_receipts",
    "bounded_fixture_session.json",
  );
  await mkdir(path.dirname(receiptPath), { recursive: true });
  await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
}

function boundedStrongCommandFixture(calls) {
  return (command, args) => {
    calls.push({ command, args: [...args] });
    if (command === "ffmpeg") {
      writeFileSync(args.at(-1), Buffer.from([0]));
      return { status: 0 };
    }
    if (command === "whisper-cli") {
      const outputBase = args[args.indexOf("-of") + 1];
      writeFileSync(`${outputBase}.json`, JSON.stringify({
        transcription: [{
          offsets: { from: 2000, to: 4000 },
          text: "FIXTURE_SEGMENT",
          tokens: [],
        }],
      }), "utf8");
      writeFileSync(`${outputBase}.txt`, "FIXTURE_SEGMENT", "utf8");
      writeFileSync(`${outputBase}.srt`, "FIXTURE_SEGMENT", "utf8");
      return { status: 0 };
    }
    throw new Error(`unexpected command: ${command}`);
  };
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

import crypto from "node:crypto";
import { createReadStream, existsSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { emitNotification } from "../town_crier/runtime.mjs";
import { prepareDeliveryReceipt } from "./delivery_receipt.mjs";

export const localAsrProfileSchemaVersion = "soulforge.local_asr_profile.v0";
export const localAsrRunSchemaVersion = "soulforge.local_asr_run.v0";
export const defaultLocalAsrProfileRef = "_workspaces/system/voice_capture/config/local_asr.profile.json";
export const voiceTranscriptionCompletedEvent = "voice_transcription_completed";

export function buildDefaultLocalAsrProfile() {
  return {
    schema_version: localAsrProfileSchemaVersion,
    engine: "whisper.cpp",
    asr_binary: "whisper-cli",
    ffmpeg_binary: "ffmpeg",
    model_path: "_workspaces/system/voice_capture/models/ggml-large-v3-turbo-q5_0.bin",
    model_id: "large-v3-turbo-q5_0",
    model_sha1: "e050f7970618a659205450ad97eb95a18d69c9ee",
    language: "ko",
    terms_prompt: "",
    run_id: "whispercpp_large-v3-turbo-q5_0_ko_v2_vad",
    chunk_seconds: 1800,
    overlap_seconds: 10,
    vad: {
      enabled: true,
      model_path: "_workspaces/system/voice_capture/models/ggml-silero-v6.2.0.bin",
      model_id: "silero-v6.2.0",
      model_sha256: "2aa269b785eeb53a82983a20501ddf7c1d9c48e33ab63a41391ac6c9f7fb6987",
      threshold: 0.5,
      min_speech_duration_ms: 120,
      min_silence_duration_ms: 500,
      max_speech_duration_seconds: 30,
      speech_pad_ms: 500,
      samples_overlap_seconds: 0.2,
    },
    decoding: {
      no_fallback: true,
      suppress_non_speech_tokens: true,
      max_context_tokens: 0,
    },
    repetition_filter: {
      enabled: true,
      minimum_text_characters: 4,
      lookback_seconds: 90,
    },
    output_subdir: "analysis/local_asr",
    queue_root: "_workspaces/system/voice_capture/local_asr_queue",
    max_sessions_per_queue_run: 1,
    evidence_role: "independent_machine_transcript_unverified",
  };
}

export async function writeDefaultLocalAsrProfile(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const profilePath = resolveRepoPath(repoRoot, options.profileRef ?? defaultLocalAsrProfileRef);
  const profile = { ...buildDefaultLocalAsrProfile(), ...(options.profile ?? {}) };
  if (!options.apply) return { applied: false, profile_path: profilePath, profile };
  await fs.mkdir(path.dirname(profilePath), { recursive: true });
  if (existsSync(profilePath) && !options.force) {
    return { applied: false, reason: "profile_exists", profile_path: profilePath, profile };
  }
  await atomicWriteJson(profilePath, profile);
  return { applied: true, profile_path: profilePath, profile };
}

export async function loadLocalAsrProfile(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const profilePath = resolveRepoPath(repoRoot, options.profileRef ?? defaultLocalAsrProfileRef);
  const profile = JSON.parse(await fs.readFile(profilePath, "utf8"));
  if (profile.schema_version !== localAsrProfileSchemaVersion) {
    throw new Error(`unsupported local ASR profile schema: ${profile.schema_version ?? "missing"}`);
  }
  return { profilePath, profile };
}

export async function buildLocalAsrPreflight(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  let profile = options.profile;
  let profilePath = null;
  const checks = [];
  const blockers = [];
  if (!profile) {
    try {
      const loaded = await loadLocalAsrProfile({ repoRoot, profileRef: options.profileRef });
      profile = loaded.profile;
      profilePath = loaded.profilePath;
    } catch {
      blockers.push(`local ASR profile missing or invalid: ${options.profileRef ?? defaultLocalAsrProfileRef}`);
      return { schema_version: "soulforge.local_asr_preflight.v0", ok: false, checks, blockers };
    }
  }

  for (const command of [profile.asr_binary, profile.ffmpeg_binary]) {
    const check = commandAvailability(command);
    checks.push({ id: `${command}_available`, ...check });
    if (!check.ok) blockers.push(`missing executable: ${command}`);
  }
  const modelPath = resolveRepoPath(repoRoot, profile.model_path);
  const modelCheck = { id: "model_present", ok: existsSync(modelPath), ref: relativeRef(repoRoot, modelPath) };
  checks.push(modelCheck);
  if (!modelCheck.ok) blockers.push(`local ASR model missing: ${profile.model_path}`);
  if (modelCheck.ok && profile.model_sha1) {
    const observedSha1 = await hashFile(modelPath, "sha1");
    const checksumOk = observedSha1 === String(profile.model_sha1).toLowerCase();
    checks.push({ id: "model_sha1", ok: checksumOk, observed_sha1: observedSha1 });
    if (!checksumOk) blockers.push("local ASR model checksum mismatch");
  }
  if (profile.vad?.enabled) {
    const vadModelPath = resolveRepoPath(repoRoot, profile.vad.model_path);
    const vadModelCheck = { id: "vad_model_present", ok: existsSync(vadModelPath), ref: relativeRef(repoRoot, vadModelPath) };
    checks.push(vadModelCheck);
    if (!vadModelCheck.ok) blockers.push(`local ASR VAD model missing: ${profile.vad.model_path}`);
    if (vadModelCheck.ok && profile.vad.model_sha256) {
      const observedSha256 = await hashFile(vadModelPath, "sha256");
      const checksumOk = observedSha256 === String(profile.vad.model_sha256).toLowerCase();
      checks.push({ id: "vad_model_sha256", ok: checksumOk, observed_sha256: observedSha256 });
      if (!checksumOk) blockers.push("local ASR VAD model checksum mismatch");
    }
  }
  checks.push({ id: "output_boundary", ok: String(profile.output_subdir).startsWith("analysis/local_asr") });
  if (!String(profile.output_subdir).startsWith("analysis/local_asr")) blockers.push("local ASR output_subdir must stay under analysis/local_asr");

  return {
    schema_version: "soulforge.local_asr_preflight.v0",
    ok: blockers.length === 0,
    profile_ref: profilePath ? relativeRef(repoRoot, profilePath) : options.profileRef ?? defaultLocalAsrProfileRef,
    model_ref: relativeRef(repoRoot, modelPath),
    checks,
    blockers,
  };
}

export function buildChunkWindows(durationSeconds, options = {}) {
  const duration = Math.max(Number(durationSeconds) || 0, 0);
  const chunkSeconds = Math.max(Number(options.chunkSeconds) || 1800, 1);
  const overlapSeconds = Math.max(Math.min(Number(options.overlapSeconds) || 0, chunkSeconds / 2), 0);
  const windows = [];
  for (let nominalStart = 0, index = 1; nominalStart < duration; nominalStart += chunkSeconds, index += 1) {
    const nominalEnd = Math.min(nominalStart + chunkSeconds, duration);
    const extractStart = Math.max(nominalStart - overlapSeconds, 0);
    const extractEnd = Math.min(nominalEnd + overlapSeconds, duration);
    windows.push({
      chunk_index: index,
      nominal_start_seconds: nominalStart,
      nominal_end_seconds: nominalEnd,
      extract_start_seconds: extractStart,
      extract_duration_seconds: extractEnd - extractStart,
    });
  }
  return windows;
}

export function parseWhisperJson(value, window, options = {}) {
  const payload = typeof value === "string" ? JSON.parse(value) : value;
  const rows = [];
  for (const segment of payload?.transcription ?? []) {
    const localStart = Number(segment?.offsets?.from ?? 0) / 1000;
    const localEnd = Number(segment?.offsets?.to ?? 0) / 1000;
    const start = window.extract_start_seconds + localStart;
    const end = window.extract_start_seconds + localEnd;
    const midpoint = (start + end) / 2;
    const text = String(segment?.text ?? "").trim();
    if (!text) continue;
    if (midpoint < window.nominal_start_seconds || midpoint >= window.nominal_end_seconds) continue;
    rows.push({
      schema_version: "soulforge.voice_transcript_segment.v0",
      segment_id: 0,
      start_seconds: roundMillis(start),
      end_seconds: roundMillis(end),
      speaker: "UNKNOWN",
      content: text,
      source: "whisper_cpp_independent_local",
      analysis_run_id: options.runId ?? null,
      chunk_index: window.chunk_index,
    });
  }
  return rows;
}

export function suppressRepetitiveSegments(segments, options = {}) {
  const enabled = options.enabled !== false;
  const minimumTextCharacters = Math.max(Number(options.minimum_text_characters ?? 4) || 4, 1);
  const lookbackSeconds = Math.max(Number(options.lookback_seconds ?? 90) || 90, 0);
  if (!enabled) return { kept: [...segments], suppressed: [] };
  const kept = [];
  const suppressed = [];
  const lastKeptAtByText = new Map();
  for (const segment of segments) {
    const normalized = normalizeRepeatedText(segment.content);
    const previousStart = lastKeptAtByText.get(normalized);
    const repeatCandidate = normalized.length >= minimumTextCharacters
      && previousStart != null
      && Number(segment.start_seconds) - previousStart <= lookbackSeconds;
    if (repeatCandidate) {
      suppressed.push({ ...segment, suppression_reason: "exact_text_repeat_within_lookback" });
      continue;
    }
    kept.push(segment);
    if (normalized) lastKeptAtByText.set(normalized, Number(segment.start_seconds));
  }
  return { kept, suppressed };
}

export function buildTranscriptQualityMetrics(kept, suppressed = []) {
  const rawCount = kept.length + suppressed.length;
  const uniqueCount = new Set([...kept, ...suppressed].map((segment) => normalizeRepeatedText(segment.content)).filter(Boolean)).size;
  const suppressedRatio = rawCount > 0 ? suppressed.length / rawCount : 0;
  const flags = [];
  if (rawCount >= 20 && suppressedRatio >= 0.2) flags.push("high_exact_repetition_suppressed");
  if (kept.length === 0) flags.push("no_speech_transcript_segments");
  return {
    raw_segment_count: rawCount,
    retained_segment_count: kept.length,
    suppressed_segment_count: suppressed.length,
    unique_raw_text_count: uniqueCount,
    suppressed_segment_ratio: roundRatio(suppressedRatio),
    flags,
  };
}

export function renderVoiceTranscriptionCompletedMessage(sessionManifest, analysisManifest) {
  const lines = ["음성 녹음의 로컬 전사가 완료되었습니다."];
  const recordedAt = formatKoreanRecordedAt(sessionManifest.recorded_at_local);
  if (recordedAt) lines.push(`녹음 시각: ${recordedAt}`);
  const duration = formatKoreanDuration(sessionManifest.duration_seconds);
  if (duration) lines.push(`녹음 길이: ${duration}`);
  lines.push(`전사 구간: ${Math.max(Number(analysisManifest.segment_count ?? 0) || 0, 0)}개`);
  lines.push("상태: 프로젝트 검토 대기");
  lines.push("다음 행동: 회사 PC에서 프로젝트를 확인해 주세요.");
  return lines.join("\n");
}

export async function emitVoiceTranscriptionCompleted(repoRoot, sessionManifest, analysisManifest, options = {}) {
  const emitter = options.notificationEmitter ?? emitNotification;
  try {
    const result = await emitter(repoRoot, {
      scope: "gateway",
      event: voiceTranscriptionCompletedEvent,
      text: renderVoiceTranscriptionCompletedMessage(sessionManifest, analysisManifest),
      sourceRef: analysisManifest.transcript_jsonl_ref,
    });
    return {
      event: voiceTranscriptionCompletedEvent,
      state: result?.status ?? "unknown",
      queued: result?.status === "queued",
      request_id: result?.request_id ?? null,
      raw_transcript_included: false,
    };
  } catch {
    return {
      event: voiceTranscriptionCompletedEvent,
      state: "enqueue_failed_retryable",
      queued: false,
      request_id: null,
      raw_transcript_included: false,
    };
  }
}

export async function discoverLocalAsrSessions(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const profile = options.profile ?? (await loadLocalAsrProfile({ repoRoot, profileRef: options.profileRef })).profile;
  const sessionsRoot = resolveRepoPath(repoRoot, options.sessionsRoot ?? "_workspaces/system/voice_capture/sessions");
  const rows = [];
  for (const dateEntry of await safeReadDir(sessionsRoot)) {
    if (!dateEntry.isDirectory()) continue;
    for (const sessionEntry of await safeReadDir(path.join(sessionsRoot, dateEntry.name))) {
      if (!sessionEntry.isDirectory()) continue;
      const sessionDir = path.join(sessionsRoot, dateEntry.name, sessionEntry.name);
      const manifestPath = path.join(sessionDir, "session_manifest.json");
      try {
        const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
        const audioRef = manifest.audio?.ref ?? null;
        if (!audioRef) continue;
        const audioPath = resolveRepoPath(repoRoot, audioRef);
        if (!isInside(repoRoot, audioPath) || !existsSync(audioPath)) continue;
        const outputDir = path.join(sessionDir, profile.output_subdir, profile.run_id);
        const transcriptRef = relativeRef(repoRoot, path.join(outputDir, "transcript.jsonl"));
        const analysisManifest = await readJsonIfExists(path.join(outputDir, "analysis_manifest.json"));
        const sourceSha256 = manifest.source_sha256 ?? manifest.audio?.sha256 ?? null;
        const completed = manifest.independent_transcription?.status === "completed"
          && manifest.independent_transcription?.run_id === profile.run_id
          && analysisManifest?.state === "completed"
          && analysisManifest?.source_sha256 === sourceSha256
          && existsSync(path.join(outputDir, "transcript.jsonl"));
        rows.push({
          session_id: manifest.session_id ?? sessionEntry.name,
          session_dir: sessionDir,
          session_ref: relativeRef(repoRoot, sessionDir),
          audio_ref: audioRef,
          duration_seconds: Number(manifest.duration_seconds ?? 0),
          source_sha256: sourceSha256,
          transcript_ref: transcriptRef,
          state: completed ? "completed" : "needs_analysis",
        });
      } catch {
        // Invalid or unrelated sessions remain outside the local ASR queue.
      }
    }
  }
  return rows.sort((left, right) => left.session_ref.localeCompare(right.session_ref));
}

export async function analyzeLocalAsrSession(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const profile = options.profile ?? (await loadLocalAsrProfile({ repoRoot, profileRef: options.profileRef })).profile;
  const sessionDir = resolveRepoPath(repoRoot, options.sessionDir);
  const manifestPath = path.join(sessionDir, "session_manifest.json");
  const sessionManifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  const audioRef = sessionManifest.audio?.ref;
  if (!audioRef) throw new Error("session has no source audio ref");
  const audioPath = resolveRepoPath(repoRoot, audioRef);
  if (!isInside(repoRoot, audioPath) || !existsSync(audioPath)) throw new Error("session source audio is missing or outside workspace");
  const durationSeconds = Number(sessionManifest.duration_seconds ?? 0);
  if (!(durationSeconds > 0)) throw new Error("session duration must be positive");

  const outputDir = path.join(sessionDir, profile.output_subdir, profile.run_id);
  const chunksDir = path.join(outputDir, "chunks");
  const windows = buildChunkWindows(durationSeconds, {
    chunkSeconds: profile.chunk_seconds,
    overlapSeconds: profile.overlap_seconds,
  });
  const plan = {
    schema_version: localAsrRunSchemaVersion,
    session_id: sessionManifest.session_id ?? path.basename(sessionDir),
    session_ref: relativeRef(repoRoot, sessionDir),
    source_audio_ref: audioRef,
    source_sha256: sessionManifest.source_sha256 ?? sessionManifest.audio?.sha256 ?? null,
    run_id: profile.run_id,
    engine: profile.engine,
    model_id: profile.model_id,
    model_sha1: profile.model_sha1 ?? null,
    model_ref: profile.model_path,
    vad_enabled: Boolean(profile.vad?.enabled),
    vad_model_id: profile.vad?.enabled ? profile.vad.model_id ?? null : null,
    vad_model_ref: profile.vad?.enabled ? profile.vad.model_path ?? null : null,
    vad_model_sha256: profile.vad?.enabled ? profile.vad.model_sha256 ?? null : null,
    decoding: profile.decoding ?? null,
    repetition_filter: profile.repetition_filter ?? null,
    language: profile.language,
    chunk_count: windows.length,
    provider_transcript_used_as_input: false,
    speaker_identity_verified: false,
    output_ref: relativeRef(repoRoot, outputDir),
  };
  if (!options.apply) return { applied: false, state: "planned", ...plan };

  const existingManifest = await readJsonIfExists(path.join(outputDir, "analysis_manifest.json"));
  const resumableManifest = await recoverCompletedAnalysisManifest({
    repoRoot,
    outputDir,
    plan,
    sessionManifest,
    analysisManifest: existingManifest,
  });
  if (resumableManifest) {
    const previousNotification = sessionManifest.independent_transcription?.notification ?? resumableManifest.notification ?? null;
    const notification = ["queued", "sent"].includes(previousNotification?.state)
      ? previousNotification
      : await emitVoiceTranscriptionCompleted(
        repoRoot,
        sessionManifest,
        resumableManifest,
        { notificationEmitter: options.notificationEmitter },
      );
    const finalManifest = { ...resumableManifest, notification };
    sessionManifest.independent_transcription = {
      ...(sessionManifest.independent_transcription ?? {}),
      status: "completed",
      notification,
    };
    await atomicWriteJson(path.join(outputDir, "analysis_manifest.json"), finalManifest);
    await atomicWriteJson(manifestPath, sessionManifest);
    const delivery = await prepareLocalAsrDelivery({
      repoRoot,
      sessionDir,
      producerNode: options.producerNode,
      deliveryReceiptEmitter: options.deliveryReceiptEmitter,
    });
    if (delivery.warning) {
      finalManifest.delivery_warning = delivery.warning;
      sessionManifest.independent_transcription.delivery_warning = delivery.warning;
      await atomicWriteJson(path.join(outputDir, "analysis_manifest.json"), finalManifest);
      await atomicWriteJson(manifestPath, sessionManifest);
    }
    return { applied: true, resumed_completed: true, ...finalManifest, delivery };
  }

  await fs.mkdir(chunksDir, { recursive: true });
  await atomicWriteJson(path.join(outputDir, "analysis_manifest.json"), {
    ...plan,
    state: "in_progress",
    started_at: (options.now ?? new Date()).toISOString(),
  });

  const runner = options.commandRunner ?? runCommand;
  const modelPath = resolveRepoPath(repoRoot, profile.model_path);
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "soulforge-local-asr-"));
  try {
    for (const window of windows) {
      const stem = `chunk_${String(window.chunk_index).padStart(5, "0")}`;
      const outputBase = path.join(chunksDir, stem);
      const receiptPath = `${outputBase}.complete.json`;
      if (existsSync(receiptPath) && existsSync(`${outputBase}.json`)) {
        try {
          JSON.parse(await fs.readFile(`${outputBase}.json`, "utf8"));
          continue;
        } catch {
          await fs.rm(receiptPath, { force: true });
        }
      }
      const wavPath = path.join(tempDir, `${stem}.wav`);
      runner(profile.ffmpeg_binary, [
        "-v", "error", "-y",
        "-ss", String(window.extract_start_seconds),
        "-t", String(window.extract_duration_seconds),
        "-i", audioPath,
        "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", wavPath,
      ], { cwd: repoRoot, label: "ffmpeg local ASR chunk extraction" });
      const whisperArgs = [
        "-m", modelPath,
        "-f", wavPath,
        "-l", profile.language,
        "-otxt", "-osrt", "-oj", "-of", outputBase,
        "-np",
      ];
      if (profile.decoding?.no_fallback) whisperArgs.push("-nf");
      if (profile.decoding?.suppress_non_speech_tokens) whisperArgs.push("-sns");
      if (profile.decoding?.max_context_tokens != null) whisperArgs.push("-mc", String(profile.decoding.max_context_tokens));
      if (profile.vad?.enabled) {
        whisperArgs.push(
          "--vad",
          "-vm", resolveRepoPath(repoRoot, profile.vad.model_path),
          "-vt", String(profile.vad.threshold ?? 0.5),
          "-vspd", String(profile.vad.min_speech_duration_ms ?? 250),
          "-vsd", String(profile.vad.min_silence_duration_ms ?? 100),
          "-vmsd", String(profile.vad.max_speech_duration_seconds ?? Number.MAX_SAFE_INTEGER),
          "-vp", String(profile.vad.speech_pad_ms ?? 30),
          "-vo", String(profile.vad.samples_overlap_seconds ?? 0.1),
        );
      }
      if (String(profile.terms_prompt ?? "").trim()) whisperArgs.push("--prompt", String(profile.terms_prompt).trim());
      runner(profile.asr_binary, whisperArgs, { cwd: repoRoot, label: "whisper.cpp independent transcription" });
      const parsed = JSON.parse(await fs.readFile(`${outputBase}.json`, "utf8"));
      await atomicWriteJson(receiptPath, {
        schema_version: "soulforge.local_asr_chunk_receipt.v0",
        chunk_index: window.chunk_index,
        window,
        segment_count: Array.isArray(parsed.transcription) ? parsed.transcription.length : 0,
        completed_at: new Date().toISOString(),
      });
      await fs.rm(wavPath, { force: true });
    }

    const segments = [];
    for (const window of windows) {
      const stem = `chunk_${String(window.chunk_index).padStart(5, "0")}`;
      const parsed = JSON.parse(await fs.readFile(path.join(chunksDir, `${stem}.json`), "utf8"));
      segments.push(...parseWhisperJson(parsed, window, { runId: profile.run_id }));
    }
    segments.sort((left, right) => left.start_seconds - right.start_seconds || left.end_seconds - right.end_seconds);
    const filtered = suppressRepetitiveSegments(segments, profile.repetition_filter);
    filtered.kept.forEach((segment, index) => { segment.segment_id = index + 1; });
    const transcriptJsonl = filtered.kept.length > 0 ? `${filtered.kept.map((segment) => JSON.stringify(segment)).join("\n")}\n` : "";
    const transcriptText = filtered.kept.length > 0
      ? `${filtered.kept.map((segment) => `[${formatSeconds(segment.start_seconds)} --> ${formatSeconds(segment.end_seconds)}] ${segment.content}`).join("\n")}\n`
      : "";
    const suppressedJsonl = filtered.suppressed.length > 0
      ? `${filtered.suppressed.map((segment) => JSON.stringify(segment)).join("\n")}\n`
      : "";
    await atomicWriteText(path.join(outputDir, "transcript.jsonl"), transcriptJsonl);
    await atomicWriteText(path.join(outputDir, "transcript.txt"), transcriptText);
    await atomicWriteText(path.join(outputDir, "suppressed_segments.jsonl"), suppressedJsonl);
    const transcriptSha256 = crypto.createHash("sha256").update(transcriptJsonl).digest("hex");
    const completedAt = new Date().toISOString();
    const qualityMetrics = buildTranscriptQualityMetrics(filtered.kept, filtered.suppressed);
    const completedManifest = {
      ...plan,
      state: "completed",
      segment_count: filtered.kept.length,
      suppressed_segment_ref: relativeRef(repoRoot, path.join(outputDir, "suppressed_segments.jsonl")),
      quality_metrics: qualityMetrics,
      transcript_ref: relativeRef(repoRoot, path.join(outputDir, "transcript.txt")),
      transcript_jsonl_ref: relativeRef(repoRoot, path.join(outputDir, "transcript.jsonl")),
      transcript_sha256: transcriptSha256,
      evidence_role: profile.evidence_role,
      quality: qualityMetrics.flags.length > 0
        ? "machine_transcript_unverified_attention_required"
        : "machine_transcript_unverified",
      claim_ceiling: "observed",
      completed_at: completedAt,
    };
    await atomicWriteJson(path.join(outputDir, "analysis_manifest.json"), completedManifest);
    await atomicWriteJson(path.join(outputDir, "project_context_source.json"), {
      schema_version: "soulforge.project_context_source_pointer.v0",
      source_kind: "voice",
      source_id: `voice:${completedManifest.session_id}:${profile.run_id}`,
      project_code_candidate: "P00-000_INBOX",
      store_ref: completedManifest.transcript_jsonl_ref,
      source_audio_ref: audioRef,
      content_hash: transcriptSha256,
      occurred_at: sessionManifest.recorded_at_local ?? null,
      ingested_at: completedAt,
      raw_payload_copied: false,
      project_route_state: "unclassified_needs_owner_confirmation",
      companion_input_kinds: ["mail", "se_schedule"],
    });
    await atomicWriteJson(
      path.join(outputDir, "project_context_event.json"),
      buildProjectContextEventPacket({
        sessionManifest,
        analysisManifest: completedManifest,
        profile,
        projectCode: "P00-000_INBOX",
      }),
    );

    sessionManifest.independent_transcription = {
      status: "completed",
      run_id: profile.run_id,
      engine: profile.engine,
      model_id: profile.model_id,
      model_sha1: profile.model_sha1 ?? null,
      evidence_role: profile.evidence_role,
      transcript_ref: completedManifest.transcript_ref,
      transcript_jsonl_ref: completedManifest.transcript_jsonl_ref,
      segment_count: segments.length,
      completed_at: completedAt,
      provider_transcript_used_as_input: false,
      speaker_identity_verified: false,
    };
    sessionManifest.canonicalization = {
      ...(sessionManifest.canonicalization ?? {}),
      state: "independent_transcript_ready_project_match_and_review_required",
      independent_transcript_is_human_verified: false,
    };
    await atomicWriteJson(manifestPath, sessionManifest);
    const notification = await emitVoiceTranscriptionCompleted(
      repoRoot,
      sessionManifest,
      completedManifest,
      { notificationEmitter: options.notificationEmitter },
    );
    const finalManifest = { ...completedManifest, notification };
    sessionManifest.independent_transcription.notification = notification;
    await atomicWriteJson(path.join(outputDir, "analysis_manifest.json"), finalManifest);
    await atomicWriteJson(manifestPath, sessionManifest);
    const delivery = await prepareLocalAsrDelivery({
      repoRoot,
      sessionDir,
      producerNode: options.producerNode,
      deliveryReceiptEmitter: options.deliveryReceiptEmitter,
    });
    if (delivery.warning) {
      finalManifest.delivery_warning = delivery.warning;
      sessionManifest.independent_transcription.delivery_warning = delivery.warning;
      try {
        await atomicWriteJson(path.join(outputDir, "analysis_manifest.json"), finalManifest);
        await atomicWriteJson(manifestPath, sessionManifest);
      } catch {
        // The returned retryable warning remains visible; delivery bookkeeping cannot roll back ASR.
      }
    }
    return { applied: true, ...finalManifest, delivery };
  } catch (error) {
    await atomicWriteJson(path.join(outputDir, "analysis_manifest.json"), {
      ...plan,
      state: "retryable_failure",
      failure_kind: classifyFailure(error),
      failed_at: new Date().toISOString(),
    });
    throw error;
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

async function prepareLocalAsrDelivery(options) {
  try {
    const emitter = options.deliveryReceiptEmitter ?? prepareDeliveryReceipt;
    const result = await emitter({
      repoRoot: options.repoRoot,
      sessionDir: options.sessionDir,
      stage: "local_asr_ready",
      producerNode: options.producerNode ?? "always_on_voice_producer",
      apply: true,
    });
    return {
      state: result.status === "ready" ? "ready" : "prepare_failed_retryable",
      receipt_ref: result.receipt_ref ?? null,
      warning: result.status === "ready" ? null : "delivery_receipt_prepare_failed_retryable",
    };
  } catch {
    return { state: "prepare_failed_retryable", warning: "delivery_receipt_prepare_failed_retryable" };
  }
}

async function recoverCompletedAnalysisManifest({ repoRoot, outputDir, plan, sessionManifest, analysisManifest }) {
  const sessionState = sessionManifest.independent_transcription ?? {};
  const transcriptRef = analysisManifest?.transcript_ref ?? sessionState.transcript_ref ?? null;
  const transcriptJsonlRef = analysisManifest?.transcript_jsonl_ref ?? sessionState.transcript_jsonl_ref ?? null;
  const completedState = analysisManifest?.state === "completed" || sessionState.status === "completed";
  if (!completedState || !transcriptRef || !transcriptJsonlRef) return null;
  const transcriptPath = resolveRepoPath(repoRoot, transcriptRef);
  const transcriptJsonlPath = resolveRepoPath(repoRoot, transcriptJsonlRef);
  if (!isInside(repoRoot, transcriptPath) || !isInside(repoRoot, transcriptJsonlPath)) return null;
  if (!existsSync(transcriptPath) || !existsSync(transcriptJsonlPath)) return null;
  if (analysisManifest?.state === "completed") return analysisManifest;

  const kept = await readJsonlRows(transcriptJsonlPath);
  const suppressedPath = path.join(outputDir, "suppressed_segments.jsonl");
  const suppressed = existsSync(suppressedPath) ? await readJsonlRows(suppressedPath) : [];
  const transcriptBytes = await fs.readFile(transcriptJsonlPath);
  const qualityMetrics = buildTranscriptQualityMetrics(kept, suppressed);
  return {
    ...plan,
    state: "completed",
    segment_count: kept.length,
    suppressed_segment_ref: relativeRef(repoRoot, suppressedPath),
    quality_metrics: qualityMetrics,
    transcript_ref: transcriptRef,
    transcript_jsonl_ref: transcriptJsonlRef,
    transcript_sha256: crypto.createHash("sha256").update(transcriptBytes).digest("hex"),
    evidence_role: sessionState.evidence_role ?? plan.evidence_role,
    quality: qualityMetrics.flags.length > 0
      ? "machine_transcript_unverified_attention_required"
      : "machine_transcript_unverified",
    claim_ceiling: "observed",
    completed_at: sessionState.completed_at ?? new Date().toISOString(),
    recovered_from_completed_session_manifest: true,
  };
}

async function readJsonlRows(filePath) {
  const text = await fs.readFile(filePath, "utf8");
  return text.split(/\r?\n/u).filter(Boolean).map((line) => JSON.parse(line));
}

export async function analyzeLocalAsrBacklog(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const profile = options.profile ?? (await loadLocalAsrProfile({ repoRoot, profileRef: options.profileRef })).profile;
  const sessions = (await discoverLocalAsrSessions({ repoRoot, profile })).filter((row) => row.state === "needs_analysis");
  const maxSessions = options.maxSessions == null ? sessions.length : Math.max(Number(options.maxSessions) || 0, 0);
  const selected = sessions.slice(0, maxSessions);
  if (!options.apply) {
    return { schema_version: "soulforge.local_asr_backlog.v0", applied: false, pending_count: sessions.length, selected_count: selected.length, sessions: selected };
  }
  const results = [];
  for (const session of selected) {
    try {
      const result = await analyzeLocalAsrSession({ ...options, repoRoot, profile, sessionDir: session.session_dir, apply: true });
      results.push({ session_id: session.session_id, state: "completed", segment_count: result.segment_count });
    } catch (error) {
      results.push({ session_id: session.session_id, state: "retryable_failure", failure_kind: classifyFailure(error) });
    }
  }
  return {
    schema_version: "soulforge.local_asr_backlog.v0",
    applied: true,
    pending_count: sessions.length,
    selected_count: selected.length,
    completed_count: results.filter((row) => row.state === "completed").length,
    failed_count: results.filter((row) => row.state === "retryable_failure").length,
    results,
  };
}

export async function enqueueLocalAsrSession(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const profile = options.profile ?? buildDefaultLocalAsrProfile();
  const sessionDir = resolveRepoPath(repoRoot, options.sessionDir);
  const manifest = JSON.parse(await fs.readFile(path.join(sessionDir, "session_manifest.json"), "utf8"));
  const sessionId = manifest.session_id ?? path.basename(sessionDir);
  const queueRoot = resolveRepoPath(repoRoot, profile.queue_root);
  const pendingPath = path.join(queueRoot, "pending", `${safeId(sessionId)}.json`);
  const payload = {
    schema_version: "soulforge.local_asr_queue_item.v0",
    session_id: sessionId,
    session_ref: relativeRef(repoRoot, sessionDir),
    source_sha256: manifest.source_sha256 ?? manifest.audio?.sha256 ?? null,
    requested_run_id: profile.run_id,
    enqueued_at: (options.now ?? new Date()).toISOString(),
    raw_payload_copied: false,
  };
  if (!options.apply) return { applied: false, queue_ref: relativeRef(repoRoot, pendingPath), payload };
  await fs.mkdir(path.dirname(pendingPath), { recursive: true });
  if (!existsSync(pendingPath)) await atomicWriteJson(pendingPath, payload);
  return { applied: true, queue_ref: relativeRef(repoRoot, pendingPath), payload };
}

export async function enqueueLocalAsrBacklog(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const profile = options.profile ?? (await loadLocalAsrProfile({ repoRoot, profileRef: options.profileRef })).profile;
  const sessions = (await discoverLocalAsrSessions({ repoRoot, profile })).filter((row) => row.state === "needs_analysis");
  const results = [];
  for (const session of sessions) {
    results.push(await enqueueLocalAsrSession({ repoRoot, profile, sessionDir: session.session_dir, apply: options.apply, now: options.now }));
  }
  return { schema_version: "soulforge.local_asr_backlog_queue.v0", applied: Boolean(options.apply), pending_count: sessions.length, queued_count: results.length, results };
}

export function buildProjectContextEventPacket({ sessionManifest, analysisManifest, profile, projectCode = "P00-000_INBOX" }) {
  const sessionId = analysisManifest.session_id ?? sessionManifest.session_id;
  return {
    schema_version: "soulforge.project_context_event_packet.v0",
    project_code: projectCode,
    raw_payload_copied: false,
    events: [
      {
        source_kind: "voice",
        source_id: `voice:${sessionId}:${profile.run_id}`,
        project_code: projectCode,
        event_time: sessionManifest.recorded_at_local ?? null,
        title: `voice recording ${sessionId}`,
        summary_hint: "Independent local machine transcript ready; project route and action review required.",
        pointer_ref: analysisManifest.transcript_jsonl_ref,
        body_access: "workspace_private_payload_pointer",
        action_required: false,
        confidence: 0,
      },
    ],
  };
}

export async function refreshLocalAsrContextEvents(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const profile = options.profile ?? (await loadLocalAsrProfile({ repoRoot, profileRef: options.profileRef })).profile;
  const sessions = await discoverLocalAsrSessions({ repoRoot, profile });
  const results = [];
  for (const session of sessions.filter((row) => row.state === "completed")) {
    const sessionManifest = JSON.parse(await fs.readFile(path.join(session.session_dir, "session_manifest.json"), "utf8"));
    const outputDir = path.join(session.session_dir, profile.output_subdir, profile.run_id);
    const analysisManifest = JSON.parse(await fs.readFile(path.join(outputDir, "analysis_manifest.json"), "utf8"));
    const outputPath = path.join(outputDir, "project_context_event.json");
    const packet = buildProjectContextEventPacket({ sessionManifest, analysisManifest, profile, projectCode: options.projectCode ?? "P00-000_INBOX" });
    if (options.apply) await atomicWriteJson(outputPath, packet);
    results.push({ session_id: session.session_id, event_ref: relativeRef(repoRoot, outputPath) });
  }
  return {
    schema_version: "soulforge.local_asr_context_event_refresh.v0",
    applied: Boolean(options.apply),
    completed_session_count: results.length,
    results,
  };
}

export async function drainLocalAsrQueue(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const profile = options.profile ?? (await loadLocalAsrProfile({ repoRoot, profileRef: options.profileRef })).profile;
  const queueRoot = resolveRepoPath(repoRoot, profile.queue_root);
  const pendingDir = path.join(queueRoot, "pending");
  const names = (await safeReadDir(pendingDir)).filter((entry) => entry.isFile() && entry.name.endsWith(".json")).map((entry) => entry.name).sort();
  const maxSessions = Math.max(Number(options.maxSessions ?? profile.max_sessions_per_queue_run ?? 1) || 1, 1);
  if (!options.apply) return { schema_version: "soulforge.local_asr_queue_drain.v0", applied: false, pending_count: names.length, selected_count: Math.min(names.length, maxSessions) };
  const results = [];
  for (const name of names.slice(0, maxSessions)) {
    const queuePath = path.join(pendingDir, name);
    try {
      const payload = JSON.parse(await fs.readFile(queuePath, "utf8"));
      const result = await analyzeLocalAsrSession({ ...options, repoRoot, profile, sessionDir: payload.session_ref, apply: true });
      const processedDir = path.join(queueRoot, "processed", formatKstDate(options.now ?? new Date()));
      await fs.mkdir(processedDir, { recursive: true });
      await fs.rename(queuePath, path.join(processedDir, name));
      results.push({ session_id: payload.session_id, state: "completed", segment_count: result.segment_count });
    } catch (error) {
      results.push({ queue_file: name, state: "retryable_failure", failure_kind: classifyFailure(error) });
    }
  }
  const remaining = (await safeReadDir(pendingDir)).filter((entry) => entry.isFile() && entry.name.endsWith(".json")).length;
  return {
    schema_version: "soulforge.local_asr_queue_drain.v0",
    applied: true,
    pending_count: names.length,
    processed_count: results.filter((row) => row.state === "completed").length,
    failed_count: results.filter((row) => row.state === "retryable_failure").length,
    remaining_pending_count: remaining,
    retry_required: remaining > 0 || results.some((row) => row.state === "retryable_failure"),
    results,
  };
}

export function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" },
  });
  if (result.status !== 0) {
    const error = new Error(`${options.label ?? command} failed with status ${result.status ?? "unknown"}`);
    error.exitCode = result.status;
    error.stderr = String(result.stderr ?? "").slice(-4000);
    throw error;
  }
  return result;
}

function commandAvailability(command) {
  const target = String(command);
  if (process.platform === "win32") {
    if (path.isAbsolute(target)) {
      return { ok: existsSync(target), resolved_path: existsSync(target) ? target : null };
    }
    const result = spawnSync("where", [target], { encoding: "utf8" });
    return { ok: result.status === 0, resolved_path: result.stdout?.trim().split(/\r?\n/)[0] || null };
  }
  const result = spawnSync("/usr/bin/which", [target], { encoding: "utf8" });
  return { ok: result.status === 0, resolved_path: result.stdout?.trim() || null };
}

function classifyFailure(error) {
  const message = String(error?.message ?? "");
  if (message.includes("ffmpeg")) return "audio_chunk_extraction_failed";
  if (message.includes("whisper.cpp")) return "local_asr_command_failed";
  if (message.includes("JSON")) return "local_asr_output_parse_failed";
  if (message.includes("source audio")) return "source_audio_missing";
  return "local_asr_session_failed";
}

async function atomicWriteJson(filePath, value) {
  await atomicWriteText(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function atomicWriteText(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  await fs.writeFile(tempPath, value, "utf8");
  await fs.rename(tempPath, filePath);
}

async function safeReadDir(value) {
  try {
    return await fs.readdir(value, { withFileTypes: true });
  } catch {
    return [];
  }
}

async function readJsonIfExists(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch {
    return null;
  }
}

function hashFile(filePath, algorithm) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash(algorithm);
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

function resolveRepoPath(repoRoot, value) {
  return path.resolve(repoRoot, value);
}

function relativeRef(repoRoot, value) {
  return path.relative(repoRoot, value).split(path.sep).join("/");
}

function isInside(root, value) {
  const relative = path.relative(root, value);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function safeId(value) {
  return String(value).replace(/[^A-Za-z0-9._-]+/gu, "_").slice(0, 180);
}

function roundMillis(value) {
  return Math.round(Number(value) * 1000) / 1000;
}

function roundRatio(value) {
  return Math.round(Number(value) * 10000) / 10000;
}

function normalizeRepeatedText(value) {
  return String(value ?? "").normalize("NFKC").replace(/\s+/gu, " ").trim().toLowerCase();
}

function formatSeconds(value) {
  const total = Math.max(0, Math.floor(Number(value) || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function formatKoreanRecordedAt(value) {
  const date = new Date(value ?? "");
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatKoreanDuration(value) {
  const totalSeconds = Math.max(Math.round(Number(value) || 0), 0);
  if (totalSeconds <= 0) return null;
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const parts = [];
  if (hours > 0) parts.push(`${hours}시간`);
  if (minutes > 0) parts.push(`${minutes}분`);
  if (seconds > 0 || parts.length === 0) parts.push(`${seconds}초`);
  return parts.join(" ");
}

function formatKstDate(date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

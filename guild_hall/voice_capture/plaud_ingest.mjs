import crypto from "node:crypto";
import { createWriteStream, existsSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { writeRecordingLibraryEntry, writeWorkmetaDraft } from "./voice_capture.mjs";
import { prepareDeliveryReceipt } from "./delivery_receipt.mjs";
import {
  buildLocalAsrPreflight,
  drainLocalAsrQueue,
  enqueueLocalAsrBacklog,
  enqueueLocalAsrSession,
  loadLocalAsrProfile,
} from "./local_asr.mjs";

export const plaudSyncProfileSchemaVersion = "soulforge.plaud_sync_profile.v0";
export const plaudSyncResultSchemaVersion = "soulforge.plaud_sync_result.v0";
export const defaultPlaudProfileRef = "_workspaces/system/voice_capture/config/plaud_sync.profile.json";

const ANSI_PATTERN = /\u001b\[[0-?]*[ -/]*[@-~]/gu;
const PLAUD_ID_PATTERN = /^[0-9a-f]{32,64}$/iu;

export function buildDefaultPlaudSyncProfile() {
  return {
    schema_version: plaudSyncProfileSchemaVersion,
    plaud_command: "plaud",
    supported_cli_versions: ["0.3.4"],
    poll_days: 14,
    max_new_per_run: 20,
    output_root: "_workspaces/system/voice_capture",
    project_code_candidate: "P00-000_INBOX",
    shared_workspace_required: true,
    readiness: {
      require_audio: true,
      require_transcript: true,
      summary_optional: true,
    },
    collect: {
      audio: true,
      provider_transcript: true,
      provider_summary: true,
    },
    evidence_roles: {
      audio: "canonical_source_candidate",
      provider_transcript: "auxiliary_unverified",
      provider_summary: "quarantined_untrusted",
    },
    register_library: true,
    write_workmeta_draft: true,
    independent_asr: {
      enabled: false,
      profile_ref: "_workspaces/system/voice_capture/config/local_asr.profile.json",
      queue_root: "_workspaces/system/voice_capture/local_asr_queue",
      enqueue_on_import: true,
      drain_after_mail_trigger: true,
    },
    launchd: {
      label: "ai.soulforge.plaud-ingest",
      trigger: "hiworks_mail_queue_watch",
      retry_interval_seconds: 300,
      unresolved_after_seconds: 3600,
    },
  };
}

export async function writeDefaultPlaudSyncProfile(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const profilePath = resolveRepoPath(repoRoot, options.profileRef ?? defaultPlaudProfileRef);
  const profile = buildDefaultPlaudSyncProfile();
  if (!options.apply) {
    return { applied: false, profile_path: profilePath, profile };
  }
  await fs.mkdir(path.dirname(profilePath), { recursive: true });
  if (existsSync(profilePath) && !options.force) {
    return { applied: false, reason: "profile_exists", profile_path: profilePath, profile };
  }
  await fs.writeFile(profilePath, `${JSON.stringify(profile, null, 2)}\n`, "utf8");
  return { applied: true, profile_path: profilePath, profile };
}

export async function loadPlaudSyncProfile(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const profilePath = resolveRepoPath(repoRoot, options.profileRef ?? defaultPlaudProfileRef);
  const profile = JSON.parse(await fs.readFile(profilePath, "utf8"));
  if (profile.schema_version !== plaudSyncProfileSchemaVersion) {
    throw new Error(`unsupported PLAUD sync profile schema: ${profile.schema_version ?? "missing"}`);
  }
  return { profilePath, profile };
}

export function stripAnsi(value) {
  return String(value ?? "").replace(ANSI_PATTERN, "");
}

export function parsePlaudRecentOutput(raw) {
  const rows = [];
  for (const line of stripAnsi(raw).split(/\r?\n/u)) {
    const match = line.match(/^\s*([0-9a-f]{32,64})\s{2,}(.+?)\s{2,}(\d{4}-\d{2}-\d{2})\s{2,}(\S+)\s*$/iu);
    if (!match) continue;
    rows.push({ id: match[1], name: match[2].trim(), date: match[3], duration_display: match[4] });
  }
  return rows;
}

export function parsePlaudFileOutput(raw) {
  const fields = {};
  for (const line of stripAnsi(raw).split(/\r?\n/u)) {
    const match = line.match(/^\s*(id|name|created_at|start_at|duration|serial_number|audio|transcript|summary):\s*(.*?)\s*$/u);
    if (match) fields[match[1]] = match[2];
  }
  if (!PLAUD_ID_PATTERN.test(fields.id ?? "")) {
    throw new Error("PLAUD file output does not contain a valid recording id");
  }
  return {
    id: fields.id,
    name: fields.name || "Untitled PLAUD recording",
    created_at: fields.created_at && fields.created_at !== "-" ? fields.created_at : null,
    start_at: fields.start_at && fields.start_at !== "-" ? fields.start_at : null,
    duration_display: fields.duration ?? null,
    audio_available: fields.audio === "available",
    transcript_available: fields.transcript === "available",
    summary_available: fields.summary === "available",
  };
}

export function parsePlaudAudioUrl(raw) {
  for (const line of stripAnsi(raw).split(/\r?\n/u)) {
    const value = line.trim();
    if (!value.startsWith("https://")) continue;
    const parsed = new URL(value);
    if (parsed.protocol === "https:") return value;
  }
  return null;
}

export function parsePlaudVersion(raw) {
  return stripAnsi(raw).match(/\bplaud\s+(\d+\.\d+\.\d+)\b/u)?.[1] ?? null;
}

export function parsePlaudProviderTimestamp(value) {
  const raw = String(value ?? "").trim();
  if (!raw) throw new Error("PLAUD recording timestamp is missing");
  const hasExplicitZone = /(?:Z|[+-]\d{2}:?\d{2})$/iu.test(raw);
  const parsed = new Date(hasExplicitZone ? raw : `${raw}Z`);
  if (Number.isNaN(parsed.getTime())) throw new Error("PLAUD recording timestamp is invalid");
  return {
    date: parsed,
    raw,
    basis: hasExplicitZone ? "explicit_iso8601_zone" : "plaud_cli_utc_without_offset",
  };
}

export function parsePlaudTranscript(raw) {
  const segments = [];
  for (const line of String(raw ?? "").split(/\r?\n/u)) {
    if (!line.trim()) continue;
    const match = line.match(/^\[(\d+):(\d{2}) - (\d+):(\d{2})\]\s+(.*)$/u);
    if (!match) continue;
    const remainder = match[5].trim();
    const speakerMatch = remainder.match(/^(.{1,80}?):\s+(.*)$/u);
    segments.push({
      schema_version: "soulforge.voice_transcript_segment.v0",
      segment_id: segments.length + 1,
      start_seconds: Number(match[1]) * 60 + Number(match[2]),
      end_seconds: Number(match[3]) * 60 + Number(match[4]),
      speaker: speakerMatch ? speakerMatch[1].trim() : "UNKNOWN",
      content: speakerMatch ? speakerMatch[2].trim() : remainder,
      source: "plaud_cli_provider_transcript",
    });
  }
  return segments;
}

export function runPlaudCommand(command, args, options = {}) {
  const spawn = options.spawnImpl ?? spawnSync;
  const invocation = resolvePlaudCommandInvocation(command, args, options);
  const result = spawn(invocation.command, invocation.args, {
    cwd: options.cwd,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
    ...(Number.isSafeInteger(options.timeoutMs) && options.timeoutMs > 0 ? { timeout: options.timeoutMs } : {}),
    ...invocation.spawnOptions,
    env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0", CI: "1", PLAUD_NO_UPDATE_NOTIFIER: "1" },
  });
  if (result.status !== 0) {
    const error = new Error(`PLAUD command failed (${args[0] ?? "unknown"}) with status ${result.status ?? "unknown"}`);
    error.exitCode = result.status;
    error.stderr = String(result.stderr ?? "").slice(0, 4000);
    throw error;
  }
  return String(result.stdout ?? "");
}

function resolvePlaudCommandInvocation(command, args, options = {}) {
  const platform = options.platform ?? process.platform;
  if (platform !== "win32") return { command, args, spawnOptions: {} };
  const availability = (options.availabilityChecker ?? commandAvailability)(command, {
    platform,
    spawnImpl: options.spawnImpl ?? spawnSync,
  });
  if (!availability.ok || !availability.resolved_path) {
    return { command, args, spawnOptions: {} };
  }
  const resolvedCommand = availability.resolved_path;
  const extension = path.win32.extname(resolvedCommand).toLowerCase();
  if (![".cmd", ".bat"].includes(extension)) {
    if (extension && ![".exe", ".com"].includes(extension)) {
      const error = new Error("unsupported Windows PLAUD command shim");
      error.code = "plaud_windows_command_shim_unsupported";
      throw error;
    }
    return { command: resolvedCommand, args, spawnOptions: {} };
  }
  const systemRoot = options.systemRoot ?? process.env.SystemRoot;
  if (typeof systemRoot !== "string" || !path.win32.isAbsolute(systemRoot)) {
    const error = new Error("Windows system root is unavailable");
    error.code = "plaud_windows_system_root_invalid";
    throw error;
  }
  const quote = (value) => {
    const text = String(value);
    if (/[\u0000\r\n"%!]/u.test(text)) {
      const error = new Error("unsafe Windows PLAUD command argument");
      error.code = "plaud_windows_command_argument_unsafe";
      throw error;
    }
    return `"${text}"`;
  };
  const commandLine = `"${[resolvedCommand, ...args].map(quote).join(" ")}"`;
  return {
    command: path.win32.join(systemRoot, "System32", "cmd.exe"),
    args: ["/d", "/s", "/c", commandLine],
    spawnOptions: { windowsVerbatimArguments: true },
  };
}

export async function buildPlaudPreflight(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const profile = options.profile ?? (await loadPlaudSyncProfile({ repoRoot, profileRef: options.profileRef })).profile;
  const runner = options.commandRunner ?? runPlaudCommand;
  const checks = [];
  const blockers = [];
  const outputRoot = resolveRepoPath(repoRoot, profile.output_root);
  const sharedRoot = path.join(repoRoot, "_workspaces", "system");

  for (const command of [profile.plaud_command, "ffprobe"]) {
    const check = commandAvailability(command);
    checks.push({ id: `${command}_available`, ...check });
    if (!check.ok) blockers.push(`missing executable: ${command}`);
  }

  if (profile.shared_workspace_required) {
    const sharedCheck = await checkSharedWorkspace(sharedRoot);
    checks.push({ id: "shared_workspace_link", ...sharedCheck });
    if (!sharedCheck.ok) blockers.push("_workspaces/system must be a shared link on the always-on collector");
  }

  if (commandAvailability(profile.plaud_command).ok) {
    try {
      const versionOutput = runner(profile.plaud_command, ["version"], { cwd: repoRoot });
      const version = parsePlaudVersion(versionOutput);
      const supported = Array.isArray(profile.supported_cli_versions)
        ? profile.supported_cli_versions.includes(version)
        : Boolean(version);
      checks.push({ id: "plaud_version", ok: supported, version });
      if (!supported) blockers.push(`unsupported PLAUD CLI version: ${version ?? "unknown"}`);
    } catch (error) {
      checks.push({ id: "plaud_version", ok: false });
      blockers.push(error.message);
    }
    try {
      runner(profile.plaud_command, ["me"], { cwd: repoRoot });
      checks.push({ id: "plaud_authenticated", ok: true });
    } catch (error) {
      checks.push({ id: "plaud_authenticated", ok: false });
      blockers.push(error.exitCode === 2 ? "PLAUD authentication required: run `plaud login`" : error.message);
    }
  }

  checks.push({ id: "output_root", ok: isInside(repoRoot, outputRoot), ref: relativeRef(repoRoot, outputRoot) });
  if (!isInside(repoRoot, outputRoot)) blockers.push("PLAUD output_root must stay inside the Soulforge workspace");

  if (profile.independent_asr?.enabled) {
    const localAsr = await buildLocalAsrPreflight({
      repoRoot,
      profileRef: profile.independent_asr.profile_ref,
    });
    checks.push({ id: "independent_local_asr", ok: localAsr.ok, profile_ref: profile.independent_asr.profile_ref });
    blockers.push(...localAsr.blockers);
  }

  return {
    schema_version: "soulforge.plaud_sync_preflight.v0",
    ok: blockers.length === 0,
    repo_root: repoRoot,
    output_root: outputRoot,
    checks,
    blockers,
    next_steps: buildPreflightNextSteps(blockers),
  };
}

export async function runPlaudSync(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const profile = options.profile ?? (await loadPlaudSyncProfile({ repoRoot, profileRef: options.profileRef })).profile;
  const runner = options.commandRunner ?? runPlaudCommand;
  const preflight = options.skipPreflight
    ? { ok: true, blockers: [], checks: [] }
    : await buildPlaudPreflight({ repoRoot, profile, commandRunner: runner });
  if (!preflight.ok) {
    return { schema_version: plaudSyncResultSchemaVersion, ok: false, applied: false, preflight, recordings: [] };
  }

  const recentRaw = runner(profile.plaud_command, ["recent", "--days", String(profile.poll_days)], { cwd: repoRoot });
  const recent = parsePlaudRecentOutput(recentRaw);
  const existing = await discoverExistingPlaudRecordings(resolveRepoPath(repoRoot, profile.output_root));
  const allCandidates = recent.filter((row) => !existing.has(row.id));
  const candidates = allCandidates.slice(0, profile.max_new_per_run);
  const recordings = [];

  for (const candidate of candidates) {
    try {
      const fileRaw = runner(profile.plaud_command, ["file", candidate.id], { cwd: repoRoot });
      const metadata = parsePlaudFileOutput(fileRaw);
      const ready =
        (!profile.readiness.require_audio || metadata.audio_available) &&
        (!profile.readiness.require_transcript || metadata.transcript_available);
      if (!ready) {
        recordings.push({ id: candidate.id, state: "pending_provider_processing", metadata });
        continue;
      }
      if (!options.apply) {
        recordings.push({ id: candidate.id, state: "ready_to_import", metadata });
        continue;
      }
      const imported = await materializePlaudRecording({
        repoRoot,
        profile,
        metadata,
        commandRunner: runner,
        audioDownloader: options.audioDownloader,
        audioProbe: options.audioProbe,
        localAsrEnqueuer: options.localAsrEnqueuer,
        localAsrProfile: options.localAsrProfile,
        deliveryReceiptEmitter: options.deliveryReceiptEmitter,
        producerNode: options.producerNode,
        now: options.now,
      });
      recordings.push(imported);
    } catch (error) {
      recordings.push({
        id: candidate.id,
        state: "import_failed_retryable",
        failure_kind: classifyPlaudImportFailure(error),
      });
    }
  }

  return {
    schema_version: plaudSyncResultSchemaVersion,
    ok: true,
    applied: Boolean(options.apply),
    recent_count: recent.length,
    existing_provider_id_count: existing.size,
    new_candidate_count: allCandidates.length,
    candidate_count: candidates.length,
    truncated_new_candidate_count: Math.max(allCandidates.length - candidates.length, 0),
    recordings,
    raw_payload_boundary: {
      audio_and_transcripts_under_workspaces_only: true,
      provider_download_url_stored: false,
      plaud_token_file_read_or_copied: false,
      workmeta_payload_copied: false,
    },
  };
}

export async function drainPlaudMailQueue(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const profile = options.profile ?? (await loadPlaudSyncProfile({ repoRoot, profileRef: options.profileRef })).profile;
  const queueRoot = path.join(resolveRepoPath(repoRoot, profile.output_root), "plaud_mail_triggers");
  const pendingDir = path.join(queueRoot, "pending");
  const processedDir = path.join(queueRoot, "processed");
  const files = (await safeReadDir(pendingDir)).filter((entry) => entry.isFile() && entry.name.endsWith(".json")).map((entry) => entry.name).sort();
  if (!options.apply) {
    const localAsr = await maybeDrainLocalAsr({ ...options, repoRoot, profile, apply: false });
    return { schema_version: "soulforge.plaud_mail_queue_drain.v0", applied: false, pending_count: files.length, pending_refs: files, local_asr: localAsr };
  }
  if (files.length === 0) {
    const localAsr = await maybeDrainLocalAsr({ ...options, repoRoot, profile, apply: true });
    return {
      schema_version: "soulforge.plaud_mail_queue_drain.v0",
      applied: true,
      pending_count: 0,
      processed_count: 0,
      sync: null,
      local_asr: localAsr,
      retry_required: Boolean(localAsr?.retry_required),
    };
  }

  const syncRunner = options.syncRunner ?? runPlaudSync;
  const sync = await syncRunner({
    repoRoot,
    profile,
    apply: true,
    commandRunner: options.commandRunner,
    audioDownloader: options.audioDownloader,
    audioProbe: options.audioProbe,
    skipPreflight: options.skipPreflight,
    now: options.now,
  });
  const importedCount = sync.recordings.filter((recording) => recording.state === "imported").length;
  const retryableRecordingCount = sync.recordings.filter((recording) =>
    ["pending_provider_processing", "import_failed_retryable"].includes(recording.state),
  ).length;
  const truncatedCount = Number(sync.truncated_new_candidate_count ?? 0);
  const now = options.now ?? new Date();
  let remainingFiles = await orderTriggersByEnqueuedAt(pendingDir, files);
  let processedFiles = [];

  if (sync.ok && importedCount > 0) {
    const retrySlots = retryableRecordingCount + truncatedCount;
    const processableCount = Math.min(importedCount, Math.max(remainingFiles.length - retrySlots, 0));
    processedFiles = remainingFiles.slice(0, processableCount);
    remainingFiles = remainingFiles.slice(processedFiles.length);
    const processedDirForDate = path.join(processedDir, formatKstParts(now).date);
    await moveQueueFiles(pendingDir, processedDirForDate, processedFiles);
  }

  let unresolvedFiles = [];
  if (sync.ok && remainingFiles.length > 0) {
    const unresolvedAfterSeconds = Number(profile.launchd?.unresolved_after_seconds ?? 3600);
    const partition = await partitionTriggersByAge(pendingDir, remainingFiles, now, unresolvedAfterSeconds);
    unresolvedFiles = partition.expired;
    remainingFiles = partition.active;
    const unresolvedDir = path.join(queueRoot, "unresolved", formatKstParts(now).date);
    await moveQueueFiles(pendingDir, unresolvedDir, unresolvedFiles);
  }

  const localAsr = await maybeDrainLocalAsr({ ...options, repoRoot, profile, apply: true });
  const retryRequired = !sync.ok || remainingFiles.length > 0 || Boolean(localAsr?.retry_required);
  return {
    schema_version: "soulforge.plaud_mail_queue_drain.v0",
    applied: true,
    pending_count: files.length,
    remaining_pending_count: remainingFiles.length,
    processed_count: processedFiles.length,
    unresolved_count: unresolvedFiles.length,
    retry_required: retryRequired,
    resolution: retryRequired
      ? remainingFiles.length > 0 || !sync.ok
        ? "waiting_for_matching_import"
        : "matching_import_processed_local_asr_retry"
      : unresolvedFiles.length > 0
        ? "unresolved_requires_review"
        : "matched_import_processed",
    sync,
    local_asr: localAsr,
  };
}

export async function materializePlaudRecording(options) {
  const { repoRoot, profile, metadata } = options;
  const runner = options.commandRunner ?? runPlaudCommand;
  const providerTimestamp = parsePlaudProviderTimestamp(metadata.start_at ?? metadata.created_at);
  const start = providerTimestamp.date;
  const sessionId = buildPlaudSessionId(start, metadata.id);
  const dateRef = formatKstParts(start).date;
  const outputRoot = resolveRepoPath(repoRoot, profile.output_root);
  const sessionDir = path.join(outputRoot, "sessions", dateRef, sessionId);
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "soulforge-plaud-ingest-"));

  try {
    const providerDir = path.join(tempDir, "provider_export");
    const audioDir = path.join(tempDir, "audio");
    await fs.mkdir(providerDir, { recursive: true });
    await fs.mkdir(audioDir, { recursive: true });

    const transcriptPath = path.join(providerDir, "transcript.txt");
    if (profile.collect.provider_transcript && metadata.transcript_available) {
      runner(profile.plaud_command, ["transcript", metadata.id, "-o", transcriptPath], { cwd: repoRoot });
    }
    const transcriptRaw = existsSync(transcriptPath) ? await fs.readFile(transcriptPath, "utf8") : "";
    const segments = parsePlaudTranscript(transcriptRaw);
    if (profile.readiness.require_transcript && metadata.transcript_available && segments.length === 0) {
      throw new Error("PLAUD transcript parse produced zero segments");
    }

    const summaryPath = path.join(providerDir, "summary.md");
    let summaryFetchFailed = false;
    if (profile.collect.provider_summary && metadata.summary_available) {
      try {
        runner(profile.plaud_command, ["summary", metadata.id, "-o", summaryPath], { cwd: repoRoot });
      } catch {
        summaryFetchFailed = true;
      }
    }

    let audio = null;
    if (profile.collect.audio && metadata.audio_available) {
      const audioOutput = runner(profile.plaud_command, ["audio", metadata.id], { cwd: repoRoot });
      const audioUrl = parsePlaudAudioUrl(audioOutput);
      if (!audioUrl) throw new Error(`PLAUD audio URL missing for ${metadata.id}`);
      const downloader = options.audioDownloader ?? downloadPlaudAudio;
      audio = await downloader(audioUrl, audioDir);
      const probe = options.audioProbe ?? probeAudio;
      audio.probe = await probe(audio.path);
    }

    const durationSeconds = Number(audio?.probe?.duration_seconds ?? segments.at(-1)?.end_seconds ?? 0);
    const end = new Date(start.getTime() + durationSeconds * 1000);
    const speakers = [...new Set(segments.map((segment) => segment.speaker).filter((speaker) => speaker !== "UNKNOWN"))];
    const importedAt = options.now ?? new Date();
    const manifest = {
      schema_version: "soulforge.voice_capture_session.v0",
      session_id: sessionId,
      source: "plaud_cli_import",
      source_provider: "PLAUD",
      provider_recording_id: metadata.id,
      source_page_title: metadata.name,
      source_sha256: audio?.sha256 ?? null,
      recorded_at_local: formatKstParts(start).iso,
      recorded_end_at_local: formatKstParts(end).iso,
      recorded_timezone: "Asia/Seoul",
      provider_timestamp: {
        start_at_raw: providerTimestamp.raw,
        basis: providerTimestamp.basis,
        normalized_timezone: "Asia/Seoul",
      },
      duration_seconds: durationSeconds,
      imported_at_local: formatKstParts(importedAt).iso,
      audio: audio
        ? {
            status: "source_present",
            evidence_role: profile.evidence_roles.audio,
            ref: relativeRef(repoRoot, path.join(sessionDir, "audio", path.basename(audio.path))),
            sha256: audio.sha256,
            size_bytes: audio.size_bytes,
            format: audio.probe.format,
            codec: audio.probe.codec,
            sample_rate_hz: audio.probe.sample_rate_hz,
            channels: audio.probe.channels,
          }
        : { status: "not_available" },
      transcript: {
        status: segments.length > 0 ? "provider_transcript_present_unverified" : "not_available",
        evidence_role: profile.evidence_roles.provider_transcript,
        ref: relativeRef(repoRoot, path.join(sessionDir, "transcript.txt")),
        jsonl_ref: relativeRef(repoRoot, path.join(sessionDir, "transcript.jsonl")),
        provider_original_ref: relativeRef(repoRoot, path.join(sessionDir, "provider_export", "transcript.txt")),
        segment_count: segments.length,
        speaker_label_count: speakers.length,
        time_basis: "seconds_from_recording_start_rounded_by_provider_cli",
        quality: "provider_machine_transcript_unverified",
      },
      provider_summary: {
        status: existsSync(summaryPath)
          ? "provider_output_present_untrusted"
          : summaryFetchFailed
            ? "provider_output_failed_optional"
            : "not_available",
        evidence_role: profile.evidence_roles.provider_summary,
        ref: relativeRef(repoRoot, path.join(sessionDir, "provider_export", "summary.md")),
        direct_task_promotion_allowed: false,
      },
      speaker_diarization: {
        status: speakers.length > 0 ? "provider_labels_present_unverified" : "not_available",
        labels: speakers,
        warning: "Provider labels are alignment hints, not verified human identities.",
      },
      canonicalization: {
        state: "needs_local_transcription_project_match_and_minutes_review",
        plaud_transcript_is_canonical: false,
        plaud_summary_is_canonical: false,
      },
      meeting_context: {
        meeting_type: "unclassified_voice_recording",
        routing_hint: "Keep isolated in P00 until AI project matching and segment review complete.",
      },
      raw_payload_boundary: {
        audio_stored_under_workspace: Boolean(audio),
        transcript_stored_under_workspace: segments.length > 0,
        provider_download_url_stored: false,
        plaud_token_file_read_or_copied: false,
        workmeta_raw_audio_copy_allowed: false,
        workmeta_raw_transcript_copy_allowed: false,
        public_git_raw_payload_allowed: false,
      },
    };

    await fs.mkdir(path.join(sessionDir, "audio"), { recursive: true });
    await fs.mkdir(path.join(sessionDir, "provider_export"), { recursive: true });
    if (audio) await fs.copyFile(audio.path, path.join(sessionDir, "audio", path.basename(audio.path)));
    if (existsSync(transcriptPath)) {
      await fs.copyFile(transcriptPath, path.join(sessionDir, "provider_export", "transcript.txt"));
      await fs.writeFile(path.join(sessionDir, "transcript.txt"), transcriptRaw, "utf8");
      await fs.writeFile(path.join(sessionDir, "transcript.jsonl"), `${segments.map((row) => JSON.stringify(row)).join("\n")}\n`, "utf8");
    }
    if (existsSync(summaryPath)) await fs.copyFile(summaryPath, path.join(sessionDir, "provider_export", "summary.md"));
    await fs.writeFile(path.join(sessionDir, "session_manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    await fs.writeFile(path.join(sessionDir, "source_event_draft.yaml"), renderPlaudSourceEventDraft({ repoRoot, profile, sessionDir, manifest }), "utf8");

    if (profile.register_library) {
      await writeRecordingLibraryEntry({
        repoRoot,
        sessionDir,
        projectCode: profile.project_code_candidate,
        routeStatus: "unclassified_needs_owner_confirmation",
        meetingType: "unclassified_voice_recording",
        apply: true,
      });
    }
    if (profile.write_workmeta_draft) {
      await writeWorkmetaDraft({ repoRoot, sessionDir, projectCode: profile.project_code_candidate, apply: true });
    }

    let delivery = { state: "not_emitted_library_registration_disabled" };
    if (profile.register_library) {
      try {
        const emitter = options.deliveryReceiptEmitter ?? prepareDeliveryReceipt;
        const result = await emitter({
          repoRoot,
          sessionDir,
          recordingId: sessionId,
          stage: "plaud_import_ready",
          producerNode: options.producerNode ?? "always_on_voice_producer",
          apply: true,
        });
        delivery = {
          state: result.status === "ready" ? "ready" : "prepare_failed_retryable",
          receipt_ref: result.receipt_ref ?? null,
          warning: result.status === "ready" ? null : "delivery_receipt_prepare_failed_retryable",
        };
        if (delivery.warning) {
          manifest.delivery_warning = delivery.warning;
          try {
            await fs.writeFile(path.join(sessionDir, "session_manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
          } catch {
            // The returned retryable warning remains visible; delivery bookkeeping cannot roll back import.
          }
        }
      } catch {
        delivery = { state: "prepare_failed_retryable", warning: "delivery_receipt_prepare_failed_retryable" };
        manifest.delivery_warning = delivery.warning;
        try {
          await fs.writeFile(path.join(sessionDir, "session_manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
        } catch {
          // The returned retryable warning remains visible; delivery bookkeeping cannot roll back import.
        }
      }
    }

    let independentAsrQueue = null;
    if (profile.independent_asr?.enabled && profile.independent_asr?.enqueue_on_import !== false) {
      try {
        const localAsrProfile = options.localAsrProfile
          ?? (await loadLocalAsrProfile({ repoRoot, profileRef: profile.independent_asr.profile_ref })).profile;
        const enqueuer = options.localAsrEnqueuer ?? enqueueLocalAsrSession;
        independentAsrQueue = await enqueuer({
          repoRoot,
          profile: localAsrProfile,
          sessionDir,
          apply: true,
          now: importedAt,
        });
      } catch {
        independentAsrQueue = { applied: false, state: "enqueue_failed_retryable" };
      }
    }

    return {
      id: metadata.id,
      state: "imported",
      session_id: sessionId,
      session_ref: relativeRef(repoRoot, sessionDir),
      audio_present: Boolean(audio),
      transcript_segments: segments.length,
      provider_summary_present: existsSync(summaryPath),
      provider_summary_fetch_failed: summaryFetchFailed,
      provider_download_url_stored: false,
      independent_asr_queue: independentAsrQueue,
      delivery,
    };
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

export async function discoverExistingPlaudRecordings(outputRoot) {
  const found = new Map();
  const sessionsRoot = path.join(outputRoot, "sessions");
  for (const dateEntry of await safeReadDir(sessionsRoot)) {
    if (!dateEntry.isDirectory()) continue;
    for (const sessionEntry of await safeReadDir(path.join(sessionsRoot, dateEntry.name))) {
      if (!sessionEntry.isDirectory()) continue;
      const manifestPath = path.join(sessionsRoot, dateEntry.name, sessionEntry.name, "session_manifest.json");
      try {
        const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
        if (PLAUD_ID_PATTERN.test(manifest.provider_recording_id ?? "")) {
          found.set(manifest.provider_recording_id, { session_id: manifest.session_id, manifest_path: manifestPath });
        }
      } catch {
        // An incomplete unrelated session must not stop discovery.
      }
    }
  }
  return found;
}

export function buildPlaudSessionId(date, providerId) {
  const parts = formatKstParts(date);
  return `${parts.compact}_plaud_cli_${providerId.slice(0, 8).toLowerCase()}`;
}

export function buildPlaudLaunchdDefinition(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const profileRef = options.profileRef ?? defaultPlaudProfileRef;
  const profile = options.profile ?? buildDefaultPlaudSyncProfile();
  const nodeId = options.nodeId ?? "home_always_on_01";
  const outputDir = path.join(repoRoot, "_workspaces", "_local", nodeId, "launchd");
  const logDir = path.join(os.homedir(), "Library", "Logs", "Soulforge", "plaud_ingest");
  const label = profile.launchd?.label ?? "ai.soulforge.plaud-ingest";
  const watchPath = path.join(resolveRepoPath(repoRoot, profile.output_root), "plaud_mail_triggers", "pending");
  const watchPaths = [watchPath];
  if (profile.independent_asr?.enabled) {
    watchPaths.push(path.join(resolveRepoPath(repoRoot, profile.independent_asr.queue_root ?? "_workspaces/system/voice_capture/local_asr_queue"), "pending"));
  }
  const retryIntervalSeconds = Number(profile.launchd?.retry_interval_seconds ?? 300);
  if (!Number.isInteger(retryIntervalSeconds) || retryIntervalSeconds < 30 || retryIntervalSeconds > 86_400) {
    throw new Error("plaud_launchd_retry_interval_seconds_invalid");
  }
  const drainCommand = `node guild_hall/voice_capture/plaud_ingest_cli.mjs drain-mail-queue --config ${shellQuote(profileRef)} --apply`;
  const command = [
    `cd ${shellQuote(repoRoot)} || exit 1`,
    "while true; do",
    `${drainCommand} >/dev/null 2>&1`,
    "command_status=$?",
    "if [ \"$command_status\" -ne 0 ]; then",
    "printf '%s\\n' \"soulforge_plaud_queue_drain_failed status=$command_status\" >&2",
    "fi",
    `sleep ${retryIntervalSeconds}`,
    "done",
  ].join("\n");
  return {
    schema_version: "soulforge.plaud_launchd_definition.v0",
    label,
    node_id: nodeId,
    output_dir: outputDir,
    plist_path: path.join(outputDir, `${label}.plist`),
    log_dir: logDir,
    stdout_path: path.join(logDir, `${label}.out.log`),
    stderr_path: path.join(logDir, `${label}.err.log`),
    trigger: "persistent_local_queue_poll",
    watch_path: watchPath,
    watch_paths: watchPaths,
    retry_interval_seconds: retryIntervalSeconds,
    program_arguments: ["/bin/zsh", "-lc", command],
  };
}

export function renderPlaudLaunchdPlist(definition) {
  const args = definition.program_arguments.map((arg) => `    <string>${xmlEscape(arg)}</string>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${xmlEscape(definition.label)}</string>
  <key>ProgramArguments</key>
  <array>
${args}
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>30</integer>
  <key>StandardOutPath</key><string>${xmlEscape(definition.stdout_path)}</string>
  <key>StandardErrorPath</key><string>${xmlEscape(definition.stderr_path)}</string>
  <key>ProcessType</key><string>Background</string>
</dict>
</plist>
`;
}

export async function writePlaudLaunchdPlist(options = {}) {
  const definition = buildPlaudLaunchdDefinition(options);
  if (!options.apply) return { applied: false, definition };
  await fs.mkdir(definition.output_dir, { recursive: true });
  await fs.mkdir(definition.log_dir, { recursive: true });
  for (const watchPath of definition.watch_paths ?? [definition.watch_path]) {
    await fs.mkdir(watchPath, { recursive: true });
  }
  await fs.writeFile(definition.plist_path, renderPlaudLaunchdPlist(definition), "utf8");
  return {
    applied: true,
    definition,
    install_commands: [
      `cp ${shellQuote(definition.plist_path)} ~/Library/LaunchAgents/`,
      `launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/${path.basename(definition.plist_path)}`,
      `launchctl kickstart -k gui/$(id -u)/${definition.label}`,
    ],
  };
}

async function downloadPlaudAudio(url, outputDir) {
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok || !response.body) throw new Error(`PLAUD audio download failed with status ${response.status}`);
  const extension = audioExtension(response.headers.get("content-type"), new URL(response.url).pathname);
  const outputPath = path.join(outputDir, `source${extension}`);
  const hash = crypto.createHash("sha256");
  const tap = new TransformStream({
    transform(chunk, controller) {
      hash.update(chunk);
      controller.enqueue(chunk);
    },
  });
  await pipeline(Readable.fromWeb(response.body.pipeThrough(tap)), createWriteStream(outputPath));
  const stat = await fs.stat(outputPath);
  return { path: outputPath, size_bytes: stat.size, sha256: hash.digest("hex") };
}

async function maybeDrainLocalAsr(options) {
  const { repoRoot, profile } = options;
  if (!profile.independent_asr?.enabled || profile.independent_asr?.drain_after_mail_trigger === false) return null;
  try {
    const localAsrProfile = options.localAsrProfile
      ?? (await loadLocalAsrProfile({ repoRoot, profileRef: profile.independent_asr.profile_ref })).profile;
    const backlogEnqueuer = options.localAsrBacklogEnqueuer ?? enqueueLocalAsrBacklog;
    const backlogRecovery = await backlogEnqueuer({
      repoRoot,
      profile: localAsrProfile,
      apply: options.apply,
      now: options.now,
    });
    const drainer = options.localAsrQueueDrainer ?? drainLocalAsrQueue;
    const drain = await drainer({
      repoRoot,
      profile: localAsrProfile,
      profileRef: profile.independent_asr.profile_ref,
      apply: options.apply,
      maxSessions: localAsrProfile.max_sessions_per_queue_run,
      now: options.now,
      commandRunner: options.localAsrCommandRunner,
    });
    return {
      ...drain,
      backlog_recovery: {
        applied: Boolean(backlogRecovery.applied),
        pending_count: Number(backlogRecovery.pending_count ?? 0),
        queued_count: Number(backlogRecovery.queued_count ?? 0),
      },
    };
  } catch {
    return {
      schema_version: "soulforge.local_asr_queue_drain.v0",
      applied: Boolean(options.apply),
      retry_required: true,
      failure_kind: "local_asr_queue_drain_failed",
    };
  }
}

function probeAudio(audioPath) {
  const result = spawnSync("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=duration,format_name:stream=codec_name,sample_rate,channels",
    "-of",
    "json",
    audioPath,
  ], { encoding: "utf8", maxBuffer: 4 * 1024 * 1024 });
  if (result.status !== 0) throw new Error("ffprobe failed for downloaded PLAUD audio");
  const data = JSON.parse(result.stdout);
  const stream = (data.streams ?? []).find((value) => value.codec_name) ?? {};
  return {
    duration_seconds: Number(data.format?.duration ?? 0),
    format: data.format?.format_name ?? null,
    codec: stream.codec_name ?? null,
    sample_rate_hz: Number(stream.sample_rate ?? 0) || null,
    channels: Number(stream.channels ?? 0) || null,
  };
}

function renderPlaudSourceEventDraft({ repoRoot, profile, sessionDir, manifest }) {
  return [
    `source_event_id: voice_${manifest.session_id}`,
    "source_kind: plaud_cli_import",
    `session_dir: ${relativeRef(repoRoot, sessionDir)}`,
    `provider_recording_id: ${manifest.provider_recording_id}`,
    `recorded_at_local: ${JSON.stringify(manifest.recorded_at_local)}`,
    `duration_seconds: ${manifest.duration_seconds}`,
    `source_sha256: ${manifest.source_sha256 ?? "null"}`,
    "provider_download_url_stored: false",
    "raw_audio_in_workmeta: false",
    "raw_transcript_in_workmeta: false",
    "route_state:",
    `  project_code_candidate: ${profile.project_code_candidate}`,
    "  route_status: unclassified_needs_owner_confirmation",
    "evidence_roles:",
    "  audio: canonical_source_candidate",
    "  provider_transcript: auxiliary_unverified",
    "  provider_summary: quarantined_untrusted",
    "review_required:",
    "  - local or independent transcript generation",
    "  - project route confirmation",
    "  - meeting minutes and task candidate review",
    "",
  ].join("\n");
}

export function commandAvailability(command, options = {}) {
  const platform = options.platform ?? process.platform;
  const spawn = options.spawnImpl ?? spawnSync;
  const result = platform === "win32"
    ? spawn("where.exe", [command], { encoding: "utf8" })
    : spawn("/bin/sh", ["-lc", `command -v ${shellQuote(command)}`], { encoding: "utf8" });
  const candidates = String(result.stdout ?? "").split(/\r?\n/u).map((value) => value.trim()).filter(Boolean);
  const resolvedPath = platform === "win32"
    ? [".exe", ".com", ".cmd", ".bat"]
      .map((extension) => candidates.find((candidate) => path.win32.extname(candidate).toLowerCase() === extension))
      .find(Boolean) ?? null
    : candidates[0] ?? null;
  return { ok: result.status === 0 && Boolean(resolvedPath), resolved_path: resolvedPath };
}

function classifyPlaudImportFailure(error) {
  const message = String(error?.message ?? "");
  if (message.includes("transcript parse produced zero segments")) return "transcript_parse_empty";
  if (message.includes("audio URL missing")) return "audio_url_missing";
  if (message.includes("PLAUD command failed")) return "plaud_cli_command_failed";
  return "materialization_failed";
}

async function partitionTriggersByAge(pendingDir, files, now, cutoffSeconds) {
  const active = [];
  const expired = [];
  for (const name of files) {
    let ageSeconds = 0;
    try {
      const payload = JSON.parse(await fs.readFile(path.join(pendingDir, name), "utf8"));
      const parsed = new Date(payload.enqueued_at);
      if (!Number.isNaN(parsed.getTime())) ageSeconds = Math.max((now.getTime() - parsed.getTime()) / 1000, 0);
    } catch {
      // Invalid trigger metadata is never expired early.
    }
    if (ageSeconds >= cutoffSeconds) expired.push(name);
    else active.push(name);
  }
  return { active, expired };
}

async function orderTriggersByEnqueuedAt(pendingDir, files) {
  const rows = [];
  for (const name of files) {
    let timestamp = Number.POSITIVE_INFINITY;
    try {
      const payload = JSON.parse(await fs.readFile(path.join(pendingDir, name), "utf8"));
      const parsed = new Date(payload.enqueued_at);
      if (!Number.isNaN(parsed.getTime())) timestamp = parsed.getTime();
    } catch {
      // Invalid trigger metadata sorts last and remains reviewable.
    }
    rows.push({ name, timestamp });
  }
  return rows.sort((left, right) => left.timestamp - right.timestamp || left.name.localeCompare(right.name)).map((row) => row.name);
}

async function moveQueueFiles(sourceDir, targetDir, files) {
  await fs.mkdir(targetDir, { recursive: true });
  for (const name of files) {
    await fs.rename(path.join(sourceDir, name), path.join(targetDir, name));
  }
}

async function checkSharedWorkspace(sharedRoot) {
  try {
    const stat = await fs.lstat(sharedRoot);
    return { ok: stat.isSymbolicLink(), observed: stat.isSymbolicLink() ? "link" : "normal_directory" };
  } catch {
    return { ok: false, observed: "missing" };
  }
}

function buildPreflightNextSteps(blockers) {
  const steps = [];
  if (blockers.some((item) => item.includes("plaud"))) steps.push("Install the pinned @plaud-ai/cli and complete `plaud login` on the active collector.");
  if (blockers.some((item) => item.includes("ffprobe"))) steps.push("Install ffmpeg on the active collector.");
  if (blockers.some((item) => item.includes("shared link"))) steps.push("Materialize the active _workspaces/system OneDrive link and rerun the workspace junction audit.");
  return steps;
}

function audioExtension(contentType, pathname) {
  const ext = path.extname(pathname).toLowerCase();
  if ([".ogg", ".mp3", ".wav", ".m4a", ".flac"].includes(ext)) return ext;
  if (contentType?.includes("ogg")) return ".ogg";
  if (contentType?.includes("mpeg")) return ".mp3";
  if (contentType?.includes("wav")) return ".wav";
  if (contentType?.includes("mp4")) return ".m4a";
  if (contentType?.includes("flac")) return ".flac";
  return ".bin";
}

function formatKstParts(date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(date).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]),
  );
  const datePart = `${parts.year}-${parts.month}-${parts.day}`;
  const timePart = `${parts.hour}:${parts.minute}:${parts.second}`;
  return {
    date: datePart,
    compact: `${parts.year}${parts.month}${parts.day}_${parts.hour}${parts.minute}${parts.second}`,
    iso: `${datePart}T${timePart}+09:00`,
  };
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

function shellQuote(value) {
  return `'${String(value).replaceAll("'", `'"'"'`)}'`;
}

function xmlEscape(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}

async function safeReadDir(value) {
  try {
    return await fs.readdir(value, { withFileTypes: true });
  } catch {
    return [];
  }
}

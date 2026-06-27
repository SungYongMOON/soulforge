import { spawnSync } from "node:child_process";
import { existsSync, promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

export const sessionSchemaVersion = "soulforge.voice_capture_session.v0";
export const sourceEventDraftSchemaVersion = "soulforge.voice_capture_source_event_draft.v0";
export const profileSchemaVersion = "soulforge.voice_capture_profile.v0";
export const preflightSchemaVersion = "soulforge.voice_capture_preflight.v0";
export const sessionStatusSchemaVersion = "soulforge.voice_capture_session_status.v0";
export const launchdSchemaVersion = "soulforge.voice_capture_launchd.v0";
export const workmetaDraftSchemaVersion = "soulforge.voice_capture_workmeta_draft.v0";
export const defaultWorkspaceRoot = "_workspaces/system/voice_capture/sessions";
export const defaultConfigPath = "_workspaces/system/voice_capture/config/voice_capture.profile.json";
export const defaultLaunchdOutputDir = "_workspaces/system/voice_capture/launchd";
export const defaultModelPath = "/models/ggml-large-v3-turbo.bin";

export function parsePositiveInteger(value, label) {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive integer`);
  }
  return parsed;
}

export function formatDateParts(date = new Date(), timeZone = "Asia/Seoul") {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return {
    year: values.year,
    month: values.month,
    day: values.day,
    hour: values.hour,
    minute: values.minute,
    second: values.second,
    ymd: `${values.year}-${values.month}-${values.day}`,
    compactYmd: `${values.year}${values.month}${values.day}`,
    compactTime: `${values.hour}${values.minute}${values.second}`,
    isoLike: `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}:${values.second}+09:00`,
  };
}

export function slugifyLabel(value) {
  const normalized = String(value ?? "voice")
    .normalize("NFKD")
    .replace(/[^\p{Letter}\p{Number}]+/gu, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
  return normalized || "voice";
}

export function buildSessionId({ label = "voice", now = new Date(), timeZone = "Asia/Seoul" } = {}) {
  const parts = formatDateParts(now, timeZone);
  return `${parts.compactYmd}_${parts.compactTime}_${slugifyLabel(label)}`;
}

export function resolveWorkspaceRoot(repoRoot, workspaceRoot = defaultWorkspaceRoot) {
  return path.isAbsolute(workspaceRoot) ? workspaceRoot : path.join(repoRoot, workspaceRoot);
}

export function resolveConfigPath(repoRoot, configPath = defaultConfigPath) {
  return path.isAbsolute(configPath) ? configPath : path.join(repoRoot, configPath);
}

export function shellQuote(value) {
  const text = String(value);
  if (process.platform === "win32") {
    return `"${text.replace(/"/g, '\\"')}"`;
  }
  if (text.length === 0) {
    return "''";
  }
  return `'${text.replace(/'/g, "'\"'\"'")}'`;
}

export function renderCommandTemplate(template, variables) {
  if (!template) {
    return null;
  }
  return String(template).replace(/\{([a-zA-Z0-9_]+)\}/g, (match, key) => {
    if (!(key in variables)) {
      throw new Error(`unknown voice capture template placeholder: ${match}`);
    }
    return shellQuote(variables[key]);
  });
}

export function buildMacosCommandTemplates(options = {}) {
  const recorder = options.recorder ?? "ffmpeg";
  const asrBinary = options.asrBinary ?? "whisper-cli";
  const inputDevice = options.inputDevice ?? ":0";
  const modelPath = options.modelPath ?? defaultModelPath;

  return {
    recordCmd: `${recorder} -f avfoundation -i ${shellQuote(inputDevice)} -t {duration} -ar 16000 -ac 1 {audio}`,
    asrCmd: `${asrBinary} -m ${shellQuote(modelPath)} -f {audio} -l {language} -otxt -osrt -oj -of {output_base}`,
  };
}

export function buildDefaultProfile(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const now = options.now ?? new Date();
  const timeZone = options.timeZone ?? "Asia/Seoul";
  const commands = buildMacosCommandTemplates(options);

  return {
    schema_version: profileSchemaVersion,
    profile_name: options.profileName ?? "macbook_air_local_whisper",
    generated_at_kst: formatDateParts(now, timeZone).isoLike,
    repo_root: repoRoot,
    workspace_root: options.workspaceRoot ?? defaultWorkspaceRoot,
    label: options.label ?? "office-day",
    chunk_seconds: parsePositiveInteger(options.chunkSeconds ?? 60, "chunkSeconds"),
    until_stopped: options.untilStopped ?? true,
    max_chunks: options.maxChunks ?? null,
    language: options.language ?? "ko",
    terms_prompt: options.termsPrompt ?? "",
    input_device: options.inputDevice ?? ":0",
    model_path: options.modelPath ?? defaultModelPath,
    recorder: options.recorder ?? "ffmpeg",
    asr_binary: options.asrBinary ?? "whisper-cli",
    record_cmd: commands.recordCmd,
    asr_cmd: commands.asrCmd,
    raw_payload_boundary: {
      audio_stored_under_workspace: true,
      transcript_stored_under_workspace: true,
      workmeta_raw_audio_copy_allowed: false,
      workmeta_raw_transcript_copy_allowed: false,
    },
  };
}

export async function writeVoiceCaptureProfile(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const configPath = resolveConfigPath(repoRoot, options.configPath);

  if (fileExists(configPath) && !options.force) {
    throw new Error(`config already exists: ${configPath}; pass --force to replace it`);
  }

  const profile = buildDefaultProfile({ ...options, repoRoot });
  await fs.mkdir(path.dirname(configPath), { recursive: true });
  await fs.writeFile(configPath, `${JSON.stringify(profile, null, 2)}\n`, "utf8");
  return {
    schema_version: profileSchemaVersion,
    config_path: configPath,
    profile,
  };
}

export async function loadVoiceCaptureProfile(configPath, options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const resolved = resolveConfigPath(repoRoot, configPath);
  const raw = await fs.readFile(resolved, "utf8");
  const profile = JSON.parse(raw);
  return {
    config_path: resolved,
    profile,
  };
}

export function profileToSessionOptions(profile = {}, overrides = {}) {
  return {
    repoRoot: overrides.repoRoot ?? profile.repo_root,
    workspaceRoot: overrides.workspaceRoot ?? profile.workspace_root,
    sessionId: overrides.sessionId,
    label: overrides.label ?? profile.label,
    chunkSeconds: overrides.chunkSeconds ?? profile.chunk_seconds,
    maxChunks: overrides.maxChunks ?? profile.max_chunks,
    untilStopped: overrides.untilStopped ?? profile.until_stopped,
    language: overrides.language ?? profile.language,
    recordCmd: overrides.recordCmd ?? profile.record_cmd,
    asrCmd: overrides.asrCmd ?? profile.asr_cmd,
    termsPrompt: overrides.termsPrompt ?? profile.terms_prompt,
    dryRun: overrides.dryRun,
    now: overrides.now,
    timeZone: overrides.timeZone,
  };
}

export function buildPreflightReport(options = {}) {
  const recordCmd = options.recordCmd ?? options.record_cmd ?? null;
  const asrCmd = options.asrCmd ?? options.asr_cmd ?? null;
  const modelPath = options.modelPath ?? options.model_path ?? null;
  const skipToolCheck = Boolean(options.skipToolCheck);
  const toolCheck = options.toolCheck ?? defaultToolCheck;
  const checks = [];
  const blockers = [];
  const warnings = [];

  addPresenceCheck({
    checks,
    blockers,
    id: "record_command_present",
    ok: Boolean(recordCmd),
    blocker: "missing recorder command template",
  });
  addPresenceCheck({
    checks,
    blockers,
    id: "asr_command_present",
    ok: Boolean(asrCmd),
    blocker: "missing ASR command template",
  });

  for (const [id, command] of [
    ["record_tool_available", recordCmd],
    ["asr_tool_available", asrCmd],
  ]) {
    if (!command) {
      continue;
    }
    const commandName = extractCommandName(command);
    if (!commandName) {
      checks.push({ id, ok: false, detail: "could not parse command name" });
      blockers.push(`could not parse command name for ${id}`);
      continue;
    }
    if (skipToolCheck) {
      checks.push({ id, ok: null, command_name: commandName, skipped: true });
      continue;
    }
    const availability = toolCheck(commandName);
    checks.push({ id, command_name: commandName, ...availability });
    if (!availability.ok) {
      blockers.push(`missing executable: ${commandName}`);
    }
  }

  if (modelPath) {
    const resolvedModel = path.resolve(modelPath);
    const ok = fileExists(resolvedModel);
    checks.push({
      id: "model_path_exists",
      ok,
      path: resolvedModel,
    });
    if (!ok) {
      blockers.push(`model file not found: ${resolvedModel}`);
    }
  } else {
    warnings.push("model path not declared; preflight cannot verify Whisper model availability");
    checks.push({ id: "model_path_declared", ok: false });
  }

  return {
    schema_version: preflightSchemaVersion,
    ready: blockers.length === 0,
    blockers,
    warnings,
    checks,
    next_steps: buildPreflightNextSteps(blockers, warnings),
  };
}

export function extractCommandName(command) {
  const tokens = String(command ?? "")
    .trim()
    .match(/(?:[^\s'"]+|'[^']*'|"[^"]*")+/gu);
  if (!tokens) {
    return null;
  }

  for (const token of tokens) {
    const cleaned = stripSimpleQuotes(token);
    if (!cleaned || cleaned === "env") {
      continue;
    }
    if (/^[A-Za-z_][A-Za-z0-9_]*=.*/u.test(cleaned)) {
      continue;
    }
    return path.basename(cleaned);
  }
  return null;
}

export function buildSessionPlan(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const now = options.now ?? new Date();
  const timeZone = options.timeZone ?? "Asia/Seoul";
  const dateParts = formatDateParts(now, timeZone);
  const label = options.label ?? "voice";
  const sessionId = options.sessionId ?? buildSessionId({ label, now, timeZone });
  const workspaceRoot = resolveWorkspaceRoot(repoRoot, options.workspaceRoot);
  const sessionDir = path.join(workspaceRoot, dateParts.ymd, sessionId);
  const chunkSeconds = parsePositiveInteger(options.chunkSeconds ?? 120, "chunkSeconds");
  const maxChunks = options.untilStopped ? null : parsePositiveInteger(options.maxChunks ?? 1, "maxChunks");
  const language = options.language ?? "ko";
  const termsPrompt = options.termsPrompt ?? "";

  return {
    schema_version: sessionSchemaVersion,
    repo_root: repoRoot,
    workspace_root: workspaceRoot,
    session_id: sessionId,
    session_label: label,
    session_dir: sessionDir,
    date: dateParts.ymd,
    created_at_kst: dateParts.isoLike,
    time_zone: timeZone,
    chunk_seconds: chunkSeconds,
    max_chunks: maxChunks,
    until_stopped: Boolean(options.untilStopped),
    language,
    terms_prompt: termsPrompt,
    terms_prompt_present: termsPrompt.trim().length > 0,
    raw_payload_boundary: {
      audio_stored_under_workspace: true,
      transcript_stored_under_workspace: true,
      workmeta_raw_audio_copy_allowed: false,
      workmeta_raw_transcript_copy_allowed: false,
    },
    commands: {
      record_template: options.recordCmd ?? null,
      asr_template: options.asrCmd ?? null,
    },
    output_refs: {
      manifest: path.join(sessionDir, "session_manifest.json"),
      source_event_draft: path.join(sessionDir, "source_event_draft.yaml"),
      chunk_log: path.join(sessionDir, "chunks.jsonl"),
      transcript_jsonl: path.join(sessionDir, "transcript.jsonl"),
      transcript_txt: path.join(sessionDir, "transcript.txt"),
      terms_prompt: path.join(sessionDir, "terms_prompt.txt"),
      audio_dir: path.join(sessionDir, "audio"),
      transcript_dir: path.join(sessionDir, "transcripts"),
    },
  };
}

export function buildChunkPlan(sessionPlan, chunkIndex) {
  const index = parsePositiveInteger(chunkIndex, "chunkIndex");
  const padded = String(index).padStart(6, "0");
  const audio = path.join(sessionPlan.output_refs.audio_dir, `chunk_${padded}.wav`);
  const outputBase = path.join(sessionPlan.output_refs.transcript_dir, `chunk_${padded}`);
  const variables = {
    audio,
    chunk_index: index,
    duration: sessionPlan.chunk_seconds,
    language: sessionPlan.language,
    output_base: outputBase,
    prompt_file: sessionPlan.output_refs.terms_prompt,
    session_dir: sessionPlan.session_dir,
    session_id: sessionPlan.session_id,
    terms_prompt: sessionPlan.terms_prompt ?? "",
    transcript_json: `${outputBase}.json`,
    transcript_srt: `${outputBase}.srt`,
    transcript_txt: `${outputBase}.txt`,
  };

  return {
    chunk_index: index,
    audio_ref: audio,
    output_base: outputBase,
    transcript_json_ref: variables.transcript_json,
    transcript_srt_ref: variables.transcript_srt,
    transcript_txt_ref: variables.transcript_txt,
    record_command: renderCommandTemplate(sessionPlan.commands.record_template, variables),
    asr_command: renderCommandTemplate(sessionPlan.commands.asr_template, variables),
  };
}

export function buildPlanPreview(sessionPlan) {
  return {
    session: sessionPlan,
    first_chunk: buildChunkPlan(sessionPlan, 1),
  };
}

export async function writeInitialSessionFiles(sessionPlan, options = {}) {
  await fs.mkdir(sessionPlan.output_refs.audio_dir, { recursive: true });
  await fs.mkdir(sessionPlan.output_refs.transcript_dir, { recursive: true });
  await fs.writeFile(sessionPlan.output_refs.manifest, `${JSON.stringify(sessionPlan, null, 2)}\n`, "utf8");
  await fs.writeFile(sessionPlan.output_refs.source_event_draft, renderSourceEventDraft(sessionPlan), "utf8");
  if (options.termsPrompt?.trim()) {
    await fs.writeFile(sessionPlan.output_refs.terms_prompt, `${options.termsPrompt.trim()}\n`, "utf8");
  }
}

export function renderSourceEventDraft(sessionPlan) {
  const relativeSessionDir = relativeToRepoOrAbsolute(sessionPlan.repo_root, sessionPlan.session_dir);
  const relativeManifest = relativeToRepoOrAbsolute(sessionPlan.repo_root, sessionPlan.output_refs.manifest);
  const relativeTranscript = relativeToRepoOrAbsolute(sessionPlan.repo_root, sessionPlan.output_refs.transcript_jsonl);
  const relativeTranscriptTxt = relativeToRepoOrAbsolute(sessionPlan.repo_root, sessionPlan.output_refs.transcript_txt);
  const relativeChunkLog = relativeToRepoOrAbsolute(sessionPlan.repo_root, sessionPlan.output_refs.chunk_log);

  return [
    `schema_version: ${sourceEventDraftSchemaVersion}`,
    `source_event_id: voice_${sessionPlan.session_id}`,
    "source_kind: local_microphone_capture_session",
    `source_title: ${JSON.stringify(sessionPlan.session_label)}`,
    `captured_at: ${JSON.stringify(sessionPlan.created_at_kst)}`,
    "project_route_state: unclassified_needs_owner_confirmation",
    "project_code_candidate: P00-000_INBOX",
    `storage_ref: ${JSON.stringify(relativeSessionDir)}`,
    `session_manifest_ref: ${JSON.stringify(relativeManifest)}`,
    `transcript_ref: ${JSON.stringify(relativeTranscript)}`,
    `transcript_txt_ref: ${JSON.stringify(relativeTranscriptTxt)}`,
    `chunk_log_ref: ${JSON.stringify(relativeChunkLog)}`,
    "raw_payload_copied: false",
    "workmeta_write_ready: false",
    "allowed_uses:",
    "  - metadata_review",
    "  - project_matching_candidate_generation",
    "  - draft_task_candidate_generation",
    "  - no_raw_payload_storage",
    "  - no_task_ledger_promotion_without_owner_review",
    "visible_payload_state:",
    "  raw_audio_available_in_workspace: true",
    "  transcript_available_in_workspace: true",
    "  utterance_timestamps_available: depends_on_asr_output",
    "claim_ceiling: observed",
    "source_interpretation:",
    "  - \"This draft points at local workspace audio/transcript artifacts but does not copy raw payload into _workmeta.\"",
    "  - \"Project route and formal task promotion require owner review.\"",
    "",
  ].join("\n");
}

export async function runCaptureSession(options = {}) {
  const termsPrompt = options.termsPrompt ?? "";
  const sessionPlan = buildSessionPlan({ ...options, termsPrompt });

  if (!options.dryRun && !sessionPlan.commands.record_template) {
    throw new Error("run requires --record-cmd unless --dry-run is used");
  }

  if (options.dryRun) {
    return {
      dry_run: true,
      ...buildPlanPreview(sessionPlan),
    };
  }

  await writeInitialSessionFiles(sessionPlan, { termsPrompt });

  let chunkIndex = 1;
  while (sessionPlan.until_stopped || chunkIndex <= sessionPlan.max_chunks) {
    const chunk = buildChunkPlan(sessionPlan, chunkIndex);
    await runChunk(sessionPlan, chunk);
    chunkIndex += 1;
  }

  return {
    dry_run: false,
    session: sessionPlan,
    chunks_completed: chunkIndex - 1,
  };
}

export async function runChunk(sessionPlan, chunk) {
  const recordStartedAt = new Date().toISOString();
  runShellCommand(chunk.record_command, "record");

  let asrStatus = "skipped";
  if (chunk.asr_command) {
    runShellCommand(chunk.asr_command, "asr");
    asrStatus = "ok";
  }

  const transcript = await collectTranscriptText(chunk);
  const chunkEntry = {
    schema_version: "soulforge.voice_capture_chunk.v0",
    session_id: sessionPlan.session_id,
    chunk_index: chunk.chunk_index,
    record_started_at: recordStartedAt,
    chunk_seconds: sessionPlan.chunk_seconds,
    audio_ref: relativeToRepoOrAbsolute(sessionPlan.repo_root, chunk.audio_ref),
    transcript_json_ref: fileExists(chunk.transcript_json_ref) ? relativeToRepoOrAbsolute(sessionPlan.repo_root, chunk.transcript_json_ref) : null,
    transcript_srt_ref: fileExists(chunk.transcript_srt_ref) ? relativeToRepoOrAbsolute(sessionPlan.repo_root, chunk.transcript_srt_ref) : null,
    transcript_txt_ref: fileExists(chunk.transcript_txt_ref) ? relativeToRepoOrAbsolute(sessionPlan.repo_root, chunk.transcript_txt_ref) : null,
    asr_status: asrStatus,
    transcript_text_present: Boolean(transcript?.text),
  };
  await appendJsonl(sessionPlan.output_refs.chunk_log, chunkEntry);

  if (transcript?.text) {
    await appendJsonl(sessionPlan.output_refs.transcript_jsonl, {
      schema_version: "soulforge.voice_capture_transcript_segment.v0",
      session_id: sessionPlan.session_id,
      chunk_index: chunk.chunk_index,
      start_seconds: (chunk.chunk_index - 1) * sessionPlan.chunk_seconds,
      end_seconds: chunk.chunk_index * sessionPlan.chunk_seconds,
      text: transcript.text,
      source_ref: transcript.source_ref,
    });
    await appendPlainTranscript(sessionPlan.output_refs.transcript_txt, {
      startSeconds: (chunk.chunk_index - 1) * sessionPlan.chunk_seconds,
      endSeconds: chunk.chunk_index * sessionPlan.chunk_seconds,
      text: transcript.text,
    });
  }
}

export function runShellCommand(command, label) {
  const result = spawnSync(command, {
    shell: true,
    stdio: "inherit",
  });

  if (result.status !== 0) {
    throw new Error(`${label} command failed with status ${result.status ?? "unknown"}`);
  }
}

export async function collectTranscriptText(chunk) {
  if (fileExists(chunk.transcript_txt_ref)) {
    const text = (await fs.readFile(chunk.transcript_txt_ref, "utf8")).trim();
    return text ? { text, source_ref: chunk.transcript_txt_ref } : null;
  }

  if (fileExists(chunk.transcript_json_ref)) {
    const raw = await fs.readFile(chunk.transcript_json_ref, "utf8");
    const parsed = JSON.parse(raw);
    const text = extractTextFromAsrJson(parsed).trim();
    return text ? { text, source_ref: chunk.transcript_json_ref } : null;
  }

  return null;
}

export function extractTextFromAsrJson(value) {
  if (!value) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(extractTextFromAsrJson).filter(Boolean).join(" ");
  }
  if (typeof value === "object") {
    if (typeof value.text === "string") {
      return value.text;
    }
    if (Array.isArray(value.transcription)) {
      return extractTextFromAsrJson(value.transcription);
    }
    if (Array.isArray(value.segments)) {
      return extractTextFromAsrJson(value.segments);
    }
  }
  return "";
}

export async function validateSessionDir(sessionDir) {
  const manifestPath = path.join(sessionDir, "session_manifest.json");
  const sourceEventDraftPath = path.join(sessionDir, "source_event_draft.yaml");
  const errors = [];

  if (!fileExists(manifestPath)) {
    errors.push("missing session_manifest.json");
  }
  if (!fileExists(sourceEventDraftPath)) {
    errors.push("missing source_event_draft.yaml");
  }
  if (String(sessionDir).includes(`${path.sep}_workmeta${path.sep}`)) {
    errors.push("session directory must not be under _workmeta");
  }

  return {
    ok: errors.length === 0,
    errors,
    session_dir: sessionDir,
  };
}

export async function buildSessionStatus(sessionDir) {
  const resolvedSessionDir = path.resolve(sessionDir);
  const manifestPath = path.join(resolvedSessionDir, "session_manifest.json");
  const chunkLogPath = path.join(resolvedSessionDir, "chunks.jsonl");
  const transcriptJsonlPath = path.join(resolvedSessionDir, "transcript.jsonl");
  const transcriptTxtPath = path.join(resolvedSessionDir, "transcript.txt");
  const audioDir = path.join(resolvedSessionDir, "audio");
  const transcriptDir = path.join(resolvedSessionDir, "transcripts");
  const errors = [];
  const manifest = await readJsonIfExists(manifestPath);

  if (!manifest) {
    errors.push("missing or unreadable session_manifest.json");
  }

  const audioFiles = await listFilesWithExt(audioDir, [".wav", ".m4a", ".mp3", ".flac"]);
  const transcriptJsonFiles = await listFilesWithExt(transcriptDir, [".json"]);
  const transcriptTextFiles = await listFilesWithExt(transcriptDir, [".txt"]);
  const transcriptSrtFiles = await listFilesWithExt(transcriptDir, [".srt"]);
  const chunkLogEntries = await countJsonlLines(chunkLogPath);
  const transcriptSegments = await countJsonlLines(transcriptJsonlPath);
  const latestMtime = await latestMtimeIso([
    manifestPath,
    chunkLogPath,
    transcriptJsonlPath,
    transcriptTxtPath,
    ...audioFiles.map((name) => path.join(audioDir, name)),
    ...transcriptJsonFiles.map((name) => path.join(transcriptDir, name)),
    ...transcriptTextFiles.map((name) => path.join(transcriptDir, name)),
    ...transcriptSrtFiles.map((name) => path.join(transcriptDir, name)),
  ]);
  const chunkSeconds = manifest?.chunk_seconds ? Number(manifest.chunk_seconds) : null;

  return {
    schema_version: sessionStatusSchemaVersion,
    ok: errors.length === 0,
    errors,
    session_dir: resolvedSessionDir,
    session_id: manifest?.session_id ?? path.basename(resolvedSessionDir),
    session_label: manifest?.session_label ?? null,
    created_at_kst: manifest?.created_at_kst ?? null,
    last_updated_at: latestMtime,
    audio_chunks: audioFiles.length,
    transcript_sidecars: {
      json: transcriptJsonFiles.length,
      txt: transcriptTextFiles.length,
      srt: transcriptSrtFiles.length,
    },
    chunk_log_entries: chunkLogEntries,
    transcript_segments: transcriptSegments,
    transcript_txt_present: fileExists(transcriptTxtPath),
    estimated_recorded_seconds: chunkSeconds ? audioFiles.length * chunkSeconds : null,
    raw_payload_boundary: {
      audio_stored_under_workspace: true,
      transcript_stored_under_workspace: true,
      workmeta_raw_audio_copy_allowed: false,
      workmeta_raw_transcript_copy_allowed: false,
    },
  };
}

export function buildVoiceCaptureLaunchdDefinition(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const configPath = resolveConfigPath(repoRoot, options.configPath);
  const label = options.label ?? "ai.soulforge.voice-capture";
  const shellPath = options.shellPath ?? "/bin/zsh";
  const logRoot = path.resolve(options.logRoot ?? path.join(os.homedir(), "Library", "Logs", "Soulforge", "voice_capture"));
  const stdoutPath = path.join(logRoot, `${label}.out.log`);
  const stderrPath = path.join(logRoot, `${label}.err.log`);
  const script = `cd ${shellQuote(repoRoot)} && npm run guild-hall:voice-capture -- run --config ${shellQuote(configPath)}`;

  return {
    schema_version: launchdSchemaVersion,
    label,
    repo_root: repoRoot,
    config_path: configPath,
    log_root: logRoot,
    stdout_path: stdoutPath,
    stderr_path: stderrPath,
    plist_name: `${label}.plist`,
    program_arguments: [shellPath, "-lc", script],
    run_at_load: true,
    keep_alive: options.keepAlive ?? true,
  };
}

export function renderVoiceCaptureLaunchdPlist(definition) {
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0">',
    "<dict>",
    xmlKey("Label", xmlString(definition.label)),
    "  <key>ProgramArguments</key>",
    "  <array>",
    ...definition.program_arguments.map((arg) => `    <string>${xmlEscape(arg)}</string>`),
    "  </array>",
    xmlKey("RunAtLoad", definition.run_at_load ? "<true/>" : "<false/>"),
    xmlKey("KeepAlive", definition.keep_alive ? "<true/>" : "<false/>"),
    xmlKey("StandardOutPath", xmlString(definition.stdout_path)),
    xmlKey("StandardErrorPath", xmlString(definition.stderr_path)),
    xmlKey("ProcessType", xmlString("Background")),
    "</dict>",
    "</plist>",
  ];
  return `${lines.join("\n")}\n`;
}

export async function writeVoiceCaptureLaunchdPlist(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const outputDir = path.resolve(repoRoot, options.outputDir ?? defaultLaunchdOutputDir);
  const definition = buildVoiceCaptureLaunchdDefinition({ ...options, repoRoot });
  const plistPath = path.join(outputDir, definition.plist_name);

  await fs.mkdir(outputDir, { recursive: true });
  await fs.mkdir(definition.log_root, { recursive: true });
  await fs.writeFile(plistPath, renderVoiceCaptureLaunchdPlist(definition), "utf8");

  return {
    schema_version: launchdSchemaVersion,
    output_dir: outputDir,
    plist_path: plistPath,
    definition,
    install_hint: `cp ${shellQuote(plistPath)} ~/Library/LaunchAgents/ && launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/${definition.plist_name}`,
  };
}

export async function buildWorkmetaDraftPlan(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const workmetaRoot = path.resolve(options.workmetaRoot ?? path.join(repoRoot, "_workmeta"));
  const projectCode = options.projectCode ?? "P00-000_INBOX";
  const sessionDir = path.resolve(options.sessionDir);
  const status = await buildSessionStatus(sessionDir);
  const sourceEventId = `voice_${status.session_id}`;
  const targetDir = path.join(workmetaRoot, projectCode, "reports", "voice_source_events", sourceEventId);
  const sessionRef = relativeToRepoOrAbsolute(repoRoot, sessionDir);
  const files = [
    {
      path: path.join(targetDir, "source_event_manifest.yaml"),
      content: renderWorkmetaSourceEventManifest({ repoRoot, projectCode, sourceEventId, status, sessionRef }),
    },
    {
      path: path.join(targetDir, "project_match_review.yaml"),
      content: renderProjectMatchReview({ projectCode, sourceEventId }),
    },
    {
      path: path.join(targetDir, "task_candidate_register.yaml"),
      content: renderTaskCandidateRegister({ projectCode, sourceEventId, status }),
    },
  ];

  return {
    schema_version: workmetaDraftSchemaVersion,
    apply_ready: status.ok,
    project_code: projectCode,
    source_event_id: sourceEventId,
    target_dir: targetDir,
    raw_payload_copied: false,
    raw_transcript_body_included: false,
    session_status: status,
    files: files.map((file) => ({
      path: file.path,
      bytes: Buffer.byteLength(file.content, "utf8"),
    })),
    _files: files,
  };
}

export async function writeWorkmetaDraft(options = {}) {
  const plan = await buildWorkmetaDraftPlan(options);
  if (!options.apply) {
    const { _files, ...publicPlan } = plan;
    return {
      ...publicPlan,
      applied: false,
    };
  }
  if (!plan.apply_ready) {
    throw new Error(`cannot write workmeta draft for invalid session: ${plan.session_status.errors.join("; ")}`);
  }

  for (const file of plan._files) {
    await fs.mkdir(path.dirname(file.path), { recursive: true });
    await fs.writeFile(file.path, file.content, "utf8");
  }

  const { _files, ...publicPlan } = plan;
  return {
    ...publicPlan,
    applied: true,
  };
}

export function fileExists(filePath) {
  return existsSync(filePath);
}

function addPresenceCheck({ checks, blockers, id, ok, blocker }) {
  checks.push({ id, ok });
  if (!ok) {
    blockers.push(blocker);
  }
}

function buildPreflightNextSteps(blockers, warnings) {
  const steps = [];
  if (blockers.some((blocker) => blocker.includes("ffmpeg"))) {
    steps.push("Install ffmpeg or change record_cmd to an installed recorder.");
  }
  if (blockers.some((blocker) => blocker.includes("whisper-cli"))) {
    steps.push("Install whisper.cpp whisper-cli or change asr_cmd to an installed ASR binary.");
  }
  if (blockers.some((blocker) => blocker.includes("model file not found"))) {
    steps.push("Download a local Whisper model and update model_path/asr_cmd in the profile.");
  }
  if (blockers.some((blocker) => blocker.includes("missing recorder"))) {
    steps.push("Run init-config or pass --record-cmd.");
  }
  if (blockers.some((blocker) => blocker.includes("missing ASR"))) {
    steps.push("Run init-config or pass --asr-cmd.");
  }
  if (warnings.length > 0 && steps.length === 0) {
    steps.push("Review warnings before a long recording run.");
  }
  return steps;
}

function defaultToolCheck(commandName) {
  if (path.isAbsolute(commandName)) {
    return {
      ok: fileExists(commandName),
      resolved_path: fileExists(commandName) ? commandName : null,
    };
  }

  const result = spawnSync("/bin/sh", ["-lc", `command -v ${shellQuote(commandName)}`], {
    encoding: "utf8",
  });
  const resolvedPath = result.stdout?.trim() || null;
  return {
    ok: result.status === 0 && Boolean(resolvedPath),
    resolved_path: resolvedPath,
  };
}

function stripSimpleQuotes(value) {
  const text = String(value);
  if ((text.startsWith("'") && text.endsWith("'")) || (text.startsWith('"') && text.endsWith('"'))) {
    return text.slice(1, -1);
  }
  return text;
}

async function readJsonIfExists(filePath) {
  if (!fileExists(filePath)) {
    return null;
  }
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch {
    return null;
  }
}

async function listFilesWithExt(dirPath, extensions) {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .filter((name) => extensions.includes(path.extname(name)))
      .sort();
  } catch {
    return [];
  }
}

async function countJsonlLines(filePath) {
  if (!fileExists(filePath)) {
    return 0;
  }
  const raw = await fs.readFile(filePath, "utf8");
  return raw
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean).length;
}

async function latestMtimeIso(filePaths) {
  let latest = 0;
  for (const filePath of filePaths) {
    if (!fileExists(filePath)) {
      continue;
    }
    const stat = await fs.stat(filePath);
    latest = Math.max(latest, stat.mtimeMs);
  }
  return latest > 0 ? new Date(latest).toISOString() : null;
}

function renderWorkmetaSourceEventManifest({ repoRoot, projectCode, sourceEventId, status, sessionRef }) {
  return [
    `schema_version: ${workmetaDraftSchemaVersion}`,
    `source_event_id: ${sourceEventId}`,
    "source_kind: local_microphone_capture_session",
    `project_code_candidate: ${projectCode}`,
    "project_route_state: unclassified_needs_owner_confirmation",
    `session_ref: ${JSON.stringify(sessionRef)}`,
    `session_manifest_ref: ${JSON.stringify(relativeToRepoOrAbsolute(repoRoot, path.join(status.session_dir, "session_manifest.json")))}`,
    `source_event_draft_ref: ${JSON.stringify(relativeToRepoOrAbsolute(repoRoot, path.join(status.session_dir, "source_event_draft.yaml")))}`,
    `chunk_log_ref: ${JSON.stringify(relativeToRepoOrAbsolute(repoRoot, path.join(status.session_dir, "chunks.jsonl")))}`,
    `transcript_jsonl_ref: ${JSON.stringify(relativeToRepoOrAbsolute(repoRoot, path.join(status.session_dir, "transcript.jsonl")))}`,
    `transcript_txt_ref: ${JSON.stringify(relativeToRepoOrAbsolute(repoRoot, path.join(status.session_dir, "transcript.txt")))}`,
    "raw_payload_copied: false",
    "raw_transcript_body_included: false",
    "formal_task_ledger_promotion_allowed: false",
    "session_status:",
    `  ok: ${status.ok}`,
    `  audio_chunks: ${status.audio_chunks}`,
    `  transcript_segments: ${status.transcript_segments}`,
    `  estimated_recorded_seconds: ${status.estimated_recorded_seconds ?? "null"}`,
    `  last_updated_at: ${JSON.stringify(status.last_updated_at)}`,
    "review_required:",
    "  - project route confirmation",
    "  - transcript quality review",
    "  - task candidate extraction and owner approval",
    "",
  ].join("\n");
}

function renderProjectMatchReview({ projectCode, sourceEventId }) {
  return [
    `schema_version: ${workmetaDraftSchemaVersion}`,
    `source_event_id: ${sourceEventId}`,
    `initial_project_code_candidate: ${projectCode}`,
    "route_state: needs_ai_project_match_and_owner_confirmation",
    "match_inputs:",
    "  - session metadata",
    "  - transcript refs under _workspaces",
    "  - project wiki/RAG candidates",
    "accepted_project_code: null",
    "accepted_by: null",
    "accepted_at: null",
    "notes: []",
    "",
  ].join("\n");
}

function renderTaskCandidateRegister({ projectCode, sourceEventId, status }) {
  return [
    `schema_version: ${workmetaDraftSchemaVersion}`,
    `source_event_id: ${sourceEventId}`,
    `project_code_candidate: ${projectCode}`,
    "candidate_extraction_state: needs_transcript_review",
    "raw_transcript_body_included: false",
    `transcript_segments_available: ${status.transcript_segments}`,
    "formal_task_ledger_promotion_allowed: false",
    "task_candidates: []",
    "",
  ].join("\n");
}

async function appendJsonl(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.appendFile(filePath, `${JSON.stringify(value)}\n`, "utf8");
}

async function appendPlainTranscript(filePath, { startSeconds, endSeconds, text }) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.appendFile(filePath, `[${formatSeconds(startSeconds)} --> ${formatSeconds(endSeconds)}] ${text}\n`, "utf8");
}

function formatSeconds(value) {
  const total = Number(value);
  const minutes = Math.floor(total / 60);
  const seconds = Math.floor(total % 60);
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function xmlKey(name, value, indent = 2) {
  const pad = " ".repeat(indent);
  return `${pad}<key>${xmlEscape(name)}</key>\n${pad}${value}`;
}

function xmlString(value) {
  return `<string>${xmlEscape(value)}</string>`;
}

function xmlEscape(value) {
  return String(value)
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;")
    .replace(/'/gu, "&apos;");
}

function relativeToRepoOrAbsolute(repoRoot, filePath) {
  const relative = path.relative(repoRoot, filePath);
  if (!relative || (!relative.startsWith("..") && !path.isAbsolute(relative))) {
    return normalizePath(relative || ".");
  }
  if (!relative.startsWith("..")) {
    return normalizePath(relative || ".");
  }
  return normalizePath(filePath);
}

function normalizePath(filePath) {
  return String(filePath).split(path.sep).join("/");
}

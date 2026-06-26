import { spawnSync } from "node:child_process";
import { existsSync, promises as fs } from "node:fs";
import path from "node:path";

export const sessionSchemaVersion = "soulforge.voice_capture_session.v0";
export const sourceEventDraftSchemaVersion = "soulforge.voice_capture_source_event_draft.v0";
export const defaultWorkspaceRoot = "_workspaces/system/voice_capture/sessions";

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

export function shellQuote(value) {
  const text = String(value);
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

export function fileExists(filePath) {
  return existsSync(filePath);
}

async function appendJsonl(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.appendFile(filePath, `${JSON.stringify(value)}\n`, "utf8");
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

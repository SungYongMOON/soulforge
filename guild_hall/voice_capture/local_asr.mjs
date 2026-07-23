import crypto from "node:crypto";
import { createReadStream, existsSync, readFileSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import Ajv2020 from "ajv/dist/2020.js";
import { emitNotification } from "../town_crier/runtime.mjs";
import {
  prepareDeliveryReceipt,
  producerReceiptRef,
  validateDeliveryReceipt,
} from "./delivery_receipt.mjs";

export const localAsrProfileSchemaVersion = "soulforge.local_asr_profile.v0";
export const localAsrRunSchemaVersion = "soulforge.local_asr_run.v0";
export const defaultLocalAsrProfileRef = "_workspaces/system/voice_capture/config/local_asr.profile.json";
export const voiceTranscriptionCompletedEvent = "voice_transcription_completed";
export const boundedStrongAsrRequestSchemaVersion = "soulforge.voice_bounded_strong_asr_request.v1";
export const boundedStrongAsrRevisionSchemaVersion = "soulforge.voice_bounded_strong_asr_revision.v1";
export const voiceHppContinuityReceiptSchemaVersion = "soulforge.voice_hpp_continuity_receipt.v1";

const STRONG_MODEL_ID = "large-v3-q5_0";
const STRONG_MODEL_SHA256 = "d75795ecff3f83b5faa89d1900604ad8c780abd5739fae406de19f23ecd98ad1";
const FAST_MODEL_ID = "large-v3-turbo-q5_0";
const FAST_EVIDENCE_ROLE = "independent_machine_transcript_unverified";
const STRONG_EVIDENCE_ROLE = "independent_machine_transcript_stronger_unverified";
const SAFE_ID_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,127})$/u;
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const SHA1_PATTERN = /^[a-f0-9]{40}$/u;
const BOUNDED_STRONG_ASR_REQUEST_SCHEMA = JSON.parse(readFileSync(new URL("./bounded_strong_asr_request.schema.json", import.meta.url), "utf8"));
const BOUNDED_STRONG_ASR_REVISION_SCHEMA = JSON.parse(readFileSync(new URL("./bounded_strong_asr_revision.schema.json", import.meta.url), "utf8"));
const VOICE_HPP_CONTINUITY_RECEIPT_SCHEMA = JSON.parse(readFileSync(new URL("./voice_hpp_continuity_receipt.schema.json", import.meta.url), "utf8"));
const boundedSchemaValidator = new Ajv2020({
  allErrors: true,
  strict: true,
  allowUnionTypes: true,
  formats: { "date-time": true },
});
const validateBoundedStrongAsrRequestSchema = boundedSchemaValidator.compile(BOUNDED_STRONG_ASR_REQUEST_SCHEMA);
const validateBoundedStrongAsrRevisionSchema = boundedSchemaValidator.compile(BOUNDED_STRONG_ASR_REVISION_SCHEMA);
const validateVoiceHppContinuityReceiptSchema = boundedSchemaValidator.compile(VOICE_HPP_CONTINUITY_RECEIPT_SCHEMA);

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
    bounded_strong_asr: {
      enabled: false,
      model_path: "_workspaces/system/voice_capture/models/ggml-large-v3-q5_0.bin",
      model_id: STRONG_MODEL_ID,
      model_sha1: null,
      model_sha256: STRONG_MODEL_SHA256,
      evidence_role: STRONG_EVIDENCE_ROLE,
      max_windows_per_request: 16,
    },
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
  if (profile.bounded_strong_asr?.enabled === true) {
    const strong = profile.bounded_strong_asr;
    const safeStrongRef = isSafeRelativeRef(strong.model_path)
      && String(strong.model_path).startsWith("_workspaces/system/voice_capture/models/");
    checks.push({ id: "bounded_strong_model_ref_safe", ok: safeStrongRef });
    if (!safeStrongRef) blockers.push("bounded strong ASR model_path must be a safe voice model ref");
    const strongModelPath = safeStrongRef ? resolveRepoPath(repoRoot, strong.model_path) : null;
    const present = Boolean(strongModelPath && existsSync(strongModelPath));
    checks.push({ id: "bounded_strong_model_present", ok: present, ref: safeStrongRef ? strong.model_path : null });
    if (!present) blockers.push("bounded strong ASR model missing");
    const identityOk = strong.model_id === STRONG_MODEL_ID
      && strong.model_sha256 === STRONG_MODEL_SHA256
      && SHA1_PATTERN.test(String(strong.model_sha1 ?? ""));
    checks.push({ id: "bounded_strong_model_identity", ok: identityOk });
    if (!identityOk) blockers.push("bounded strong ASR model identity is not fully pinned");
    if (present && identityOk) {
      const [observedSha1, observedSha256] = await Promise.all([
        hashFile(strongModelPath, "sha1"),
        hashFile(strongModelPath, "sha256"),
      ]);
      const checksumOk = observedSha1 === strong.model_sha1 && observedSha256 === strong.model_sha256;
      checks.push({
        id: "bounded_strong_model_hashes",
        ok: checksumOk,
        observed_sha1: observedSha1,
        observed_sha256: observedSha256,
      });
      if (!checksumOk) blockers.push("bounded strong ASR model checksum mismatch");
    }
  } else {
    checks.push({ id: "bounded_strong_runner_feature_off", ok: true });
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

export async function prepareBoundedStrongAsrRequest(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const voiceRoot = path.join(repoRoot, "_workspaces", "system", "voice_capture");
  const fastManifestPath = path.resolve(options.fastAnalysisManifestPath ?? "");
  await assertExistingInside(voiceRoot, fastManifestPath, "fast analysis manifest");
  if (path.basename(fastManifestPath) !== "analysis_manifest.json") {
    throw new Error("fast analysis manifest must name analysis_manifest.json");
  }
  const fastBytes = await readStableBytes(fastManifestPath);
  const fast = JSON.parse(fastBytes.toString("utf8"));
  validateFastAnalysisManifest(fast);
  const sessionDir = path.resolve(path.dirname(fastManifestPath), "../../..");
  await assertExistingInside(voiceRoot, sessionDir, "fast ASR session");
  const sessionManifestPath = path.join(sessionDir, "session_manifest.json");
  const sessionBytes = await readStableBytes(sessionManifestPath);
  const sessionManifest = JSON.parse(sessionBytes.toString("utf8"));
  validateCanonicalFastBinding(repoRoot, sessionDir, sessionManifest, fast, fastManifestPath);

  const semanticRun = options.semanticRun;
  validateFastSemanticSelection(semanticRun, fast);
  const windows = normalizeApprovedWindows(semanticRun.review_windows, {
    durationSeconds: Number(sessionManifest.duration_seconds),
    maxWindows: Number(options.maxWindows ?? 16),
  });
  const sourceAudioRef = requireSafeRelativeRef(sessionManifest.audio?.ref, "session source audio ref");
  const sourceSha256 = requireSha256(sessionManifest.source_sha256 ?? sessionManifest.audio?.sha256, "session source SHA-256");
  const sourcePath = path.resolve(repoRoot, sourceAudioRef);
  await assertExistingInside(sessionDir, sourcePath, "session source audio");
  const observedSource = await inspectStableFile(sourcePath);
  if (observedSource.sha256 !== sourceSha256) throw new Error("session source audio SHA-256 mismatch");
  const createdAt = utcTimestamp(options.now);
  const requestBody = {
    schema_version: boundedStrongAsrRequestSchemaVersion,
    created_at: createdAt,
    session_id: requireSafeId(fast.session_id, "fast session_id"),
    session_ref: relativeRef(repoRoot, sessionDir),
    source_audio_ref: sourceAudioRef,
    source_sha256: sourceSha256,
    fast_analysis_manifest_ref: relativeRef(repoRoot, fastManifestPath),
    fast_analysis_manifest_sha256: sha256Bytes(fastBytes),
    semantic_selection: {
      run_id: semanticRun.run_id,
      run_sha256: sha256Text(stableStringify(semanticRun)),
      engine_id: semanticRun.engine.engine_id,
      engine_version: semanticRun.engine.engine_version,
      ruleset_sha256: semanticRun.engine.ruleset_sha256,
      evidence_gate_state: semanticRun.evidence_gate.state,
    },
    approval: {
      state: "approved",
      approved_by: requireSafeId(options.approvedBy, "approved_by"),
      approved_at: createdAt,
      scope: "exact_material_windows_only",
    },
    windows,
    project_route_state: "candidate_only",
    boundaries: {
      provider_transcript_authority: "none",
      transcript_text_copied: false,
      human_acceptance_fabricated: false,
      canonical_whole_session_pointer_mutation_allowed: false,
      completion_notification_allowed: false,
      delivery_receipt_replacement_allowed: false,
    },
  };
  const request = {
    ...requestBody,
    request_id: `vsq_${sha256Text(stableStringify(requestBody)).slice(0, 24)}`,
  };
  const requestValidation = validateBoundedStrongAsrRequest(request);
  if (!requestValidation.ok) {
    throw new Error(`bounded strong ASR request validation failed: ${requestValidation.errors.join("; ")}`);
  }
  const requestPath = path.join(sessionDir, "analysis", "strong_asr_requests", `${request.request_id}.json`);
  const requestRef = relativeRef(repoRoot, requestPath);
  if (!options.apply) {
    return {
      schema_version: "soulforge.voice_bounded_strong_asr_request_prepare.v1",
      applied: false,
      duplicate: false,
      request_ref: requestRef,
      request_id: request.request_id,
      approved_window_count: request.windows.length,
      approved_duration_seconds: roundMillis(request.windows.reduce((sum, window) => sum + window.duration_seconds, 0)),
      project_route_state: "candidate_only",
      transcript_body_copied: false,
      request,
    };
  }
  await ensureWritableParentInside(sessionDir, requestPath, "bounded strong ASR request");
  const write = await writeImmutableJson(requestPath, request);
  await assertExistingInside(sessionDir, requestPath, "bounded strong ASR request");
  return {
    schema_version: "soulforge.voice_bounded_strong_asr_request_prepare.v1",
    applied: write.applied,
    duplicate: write.duplicate,
    request_ref: requestRef,
    request_id: request.request_id,
    approved_window_count: request.windows.length,
    approved_duration_seconds: roundMillis(request.windows.reduce((sum, window) => sum + window.duration_seconds, 0)),
    project_route_state: "candidate_only",
    transcript_body_copied: false,
    request,
  };
}

export function validateBoundedStrongAsrRequest(request) {
  const errors = [];
  if (request && typeof request === "object" && !Array.isArray(request)) {
    if (!validateBoundedStrongAsrRequestSchema(request)) {
      appendSchemaValidationErrors(errors, validateBoundedStrongAsrRequestSchema.errors);
    }
    const expectedKeys = [
      "approval",
      "boundaries",
      "created_at",
      "fast_analysis_manifest_ref",
      "fast_analysis_manifest_sha256",
      "project_route_state",
      "request_id",
      "schema_version",
      "semantic_selection",
      "session_id",
      "session_ref",
      "source_audio_ref",
      "source_sha256",
      "windows",
    ];
    if (stableStringify(Object.keys(request).sort()) !== stableStringify(expectedKeys)) errors.push("request fields are not exact");
    if (request.schema_version !== boundedStrongAsrRequestSchemaVersion) errors.push("request schema_version mismatch");
    if (!/^vsq_[a-f0-9]{24}$/u.test(String(request.request_id ?? ""))) errors.push("request_id is invalid");
    if (!isStrictUtcTimestamp(request.created_at)) errors.push("created_at must be strict UTC");
    for (const [name, value] of [
      ["session_ref", request.session_ref],
      ["source_audio_ref", request.source_audio_ref],
      ["fast_analysis_manifest_ref", request.fast_analysis_manifest_ref],
    ]) {
      if (!isSafeRelativeRef(value)) errors.push(`${name} must be a safe relative ref`);
    }
    if (!SAFE_ID_PATTERN.test(String(request.session_id ?? ""))) errors.push("session_id is invalid");
    if (!SHA256_PATTERN.test(String(request.source_sha256 ?? ""))) errors.push("source_sha256 is invalid");
    if (!SHA256_PATTERN.test(String(request.fast_analysis_manifest_sha256 ?? ""))) errors.push("fast_analysis_manifest_sha256 is invalid");
    const selection = request.semantic_selection;
    if (!selection || typeof selection !== "object" || Array.isArray(selection)
      || stableStringify(Object.keys(selection).sort()) !== stableStringify([
        "engine_id",
        "engine_version",
        "evidence_gate_state",
        "ruleset_sha256",
        "run_id",
        "run_sha256",
      ])) {
      errors.push("semantic_selection fields are not exact");
    } else {
      if (!/^vsl_[a-f0-9]{24}$/u.test(String(selection.run_id ?? ""))) errors.push("semantic run_id is invalid");
      if (!SHA256_PATTERN.test(String(selection.run_sha256 ?? ""))) errors.push("semantic run_sha256 is invalid");
      if (selection.engine_id !== "soulforge_voice_semantic_baseline") errors.push("semantic engine_id mismatch");
      if (!String(selection.engine_version ?? "").trim()) errors.push("semantic engine_version is required");
      if (!SHA256_PATTERN.test(String(selection.ruleset_sha256 ?? ""))) errors.push("semantic ruleset_sha256 is invalid");
      if (selection.evidence_gate_state !== "stronger_local_asr_required") errors.push("semantic evidence gate state mismatch");
    }
    const approval = request.approval;
    if (!approval || typeof approval !== "object" || Array.isArray(approval)
      || stableStringify(Object.keys(approval).sort()) !== stableStringify([
        "approved_at",
        "approved_by",
        "scope",
        "state",
      ])) {
      errors.push("approval fields are not exact");
    } else {
      if (approval.state !== "approved" || approval.scope !== "exact_material_windows_only") errors.push("approval scope is invalid");
      if (!SAFE_ID_PATTERN.test(String(approval.approved_by ?? ""))) errors.push("approved_by is invalid");
      if (!isStrictUtcTimestamp(approval.approved_at)) errors.push("approved_at must be strict UTC");
    }
    if (request.project_route_state !== "candidate_only") errors.push("project route must remain candidate-only");
    const boundaries = request.boundaries;
    if (boundaries?.provider_transcript_authority !== "none"
      || boundaries?.transcript_text_copied !== false
      || boundaries?.human_acceptance_fabricated !== false
      || boundaries?.canonical_whole_session_pointer_mutation_allowed !== false
      || boundaries?.completion_notification_allowed !== false
      || boundaries?.delivery_receipt_replacement_allowed !== false) {
      errors.push("request boundaries are invalid");
    }
    const { request_id: requestId, ...body } = request;
    const expectedId = `vsq_${sha256Text(stableStringify(body)).slice(0, 24)}`;
    if (requestId !== expectedId) errors.push("request_id does not match request content");
    const windows = Array.isArray(request.windows) ? request.windows : [];
    const normalized = [...windows].sort(compareApprovedWindows);
    if (stableStringify(windows) !== stableStringify(normalized)) errors.push("approved windows must be deterministically sorted");
    for (let index = 1; index < normalized.length; index += 1) {
      const previousEnd = normalized[index - 1].start_seconds + normalized[index - 1].duration_seconds;
      if (normalized[index].start_seconds < previousEnd) errors.push("approved windows must not overlap");
    }
    if (new Set(windows.map((window) => window.window_id)).size !== windows.length) {
      errors.push("approved window_id values must be unique");
    }
    if (Date.parse(request.approval?.approved_at) < Date.parse(request.created_at)) {
      errors.push("approved_at cannot predate created_at");
    }
    scanForbiddenMetadataKeys(request, [], errors);
  } else errors.push("request must be an object");
  return { ok: errors.length === 0, errors: [...new Set(errors)] };
}

export async function analyzeBoundedStrongAsrWindows(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const profile = options.profile ?? (await loadLocalAsrProfile({ repoRoot, profileRef: options.profileRef })).profile;
  const strong = profile.bounded_strong_asr ?? {};
  if (strong.enabled !== true) {
    return {
      schema_version: "soulforge.voice_bounded_strong_asr_run_summary.v1",
      state: "disabled",
      applied: false,
      feature_enabled: false,
      approved_window_count: 0,
      audio_payload_read: false,
      provider_payload_read: false,
      canonical_whole_session_pointer_replaced: false,
      delivery_receipt_replaced: false,
      completion_notification_emitted: false,
      project_route_state: "candidate_only",
    };
  }

  validateStrongProfile(strong);
  if (profile.output_subdir !== "analysis/local_asr") {
    throw new Error("bounded strong ASR output_subdir must be exactly analysis/local_asr");
  }
  const voiceRoot = path.join(repoRoot, "_workspaces", "system", "voice_capture");
  const modelRoot = path.join(voiceRoot, "models");
  const requestPath = path.resolve(options.requestPath ?? "");
  await assertExistingInside(voiceRoot, requestPath, "bounded strong ASR request");
  const requestBytes = await readStableBytes(requestPath);
  const request = JSON.parse(requestBytes.toString("utf8"));
  const requestValidation = validateBoundedStrongAsrRequest(request);
  if (!requestValidation.ok) {
    throw new Error(`bounded strong ASR request validation failed: ${requestValidation.errors.join("; ")}`);
  }
  const requestSha256 = sha256Bytes(requestBytes);
  const sessionDir = path.resolve(repoRoot, requireSafeRelativeRef(request.session_ref, "request session_ref"));
  await assertExistingInside(voiceRoot, sessionDir, "bounded strong ASR session");
  await assertExistingInside(sessionDir, requestPath, "bounded strong ASR request custody");
  const sessionManifestPath = path.join(sessionDir, "session_manifest.json");
  const sessionBytes = await readStableBytes(sessionManifestPath);
  const sessionManifest = JSON.parse(sessionBytes.toString("utf8"));
  const fastManifestPath = path.resolve(repoRoot, requireSafeRelativeRef(
    request.fast_analysis_manifest_ref,
    "request fast_analysis_manifest_ref",
  ));
  await assertExistingInside(sessionDir, fastManifestPath, "request fast analysis manifest");
  const fastBytes = await readStableBytes(fastManifestPath);
  const fast = JSON.parse(fastBytes.toString("utf8"));
  validateFastAnalysisManifest(fast);
  validateCanonicalFastBinding(repoRoot, sessionDir, sessionManifest, fast, fastManifestPath);
  validateRequestBindings(repoRoot, request, requestSha256, sessionDir, sessionManifest, sessionBytes, fast, fastBytes);
  const windows = normalizeApprovedWindows(request.windows, {
    durationSeconds: Number(sessionManifest.duration_seconds),
    maxWindows: Number(strong.max_windows_per_request ?? 16),
  });
  if (stableStringify(windows) !== stableStringify(request.windows)) {
    throw new Error("bounded strong ASR request windows are not normalized");
  }

  const sourceAudioRef = request.source_audio_ref;
  const sourceAudioPath = path.resolve(repoRoot, sourceAudioRef);
  await assertExistingInside(sessionDir, sourceAudioPath, "bounded strong ASR source audio");
  const strongModelPath = path.resolve(repoRoot, strong.model_path);
  await assertExistingInside(modelRoot, strongModelPath, "bounded strong ASR model");
  let vadModelPath = null;
  if (profile.vad?.enabled) {
    const vadModelRef = requireSafeRelativeRef(profile.vad.model_path, "bounded strong ASR VAD model_path");
    if (!vadModelRef.startsWith("_workspaces/system/voice_capture/models/")) {
      throw new Error("bounded strong ASR VAD model_path must be a safe voice model ref");
    }
    vadModelPath = path.resolve(repoRoot, vadModelRef);
    await assertExistingInside(modelRoot, vadModelPath, "bounded strong ASR VAD model");
    const observedVad = await inspectStableFile(vadModelPath);
    if (observedVad.sha256 !== requireSha256(profile.vad.model_sha256, "bounded strong ASR VAD model SHA-256")) {
      throw new Error("bounded strong ASR VAD model checksum mismatch");
    }
  }
  const inspectModel = options.testHooks?.inspectStrongModel ?? inspectStableFile;
  const [sourceBefore, modelBefore] = await Promise.all([
    inspectStableFile(sourceAudioPath),
    inspectModel(strongModelPath),
  ]);
  if (sourceBefore.sha256 !== request.source_sha256) throw new Error("bounded strong ASR source audio SHA-256 mismatch");
  if (modelBefore.sha1 !== strong.model_sha1 || modelBefore.sha256 !== STRONG_MODEL_SHA256) {
    throw new Error("bounded strong ASR model checksum mismatch");
  }

  const canonical = sessionManifest.independent_transcription;
  const sessionManifestSha256 = sha256Bytes(sessionBytes);
  const executionConfig = {
    engine: "whisper.cpp",
    language: String(profile.language ?? ""),
    decoding: profile.decoding ?? null,
    repetition_filter: profile.repetition_filter ?? null,
    terms_prompt_sha256: sha256Text(String(profile.terms_prompt ?? "")),
    vad: profile.vad?.enabled
      ? {
          enabled: true,
          model_id: profile.vad.model_id ?? null,
          model_sha256: profile.vad.model_sha256,
          threshold: profile.vad.threshold ?? 0.5,
          min_speech_duration_ms: profile.vad.min_speech_duration_ms ?? 250,
          min_silence_duration_ms: profile.vad.min_silence_duration_ms ?? 100,
          max_speech_duration_seconds: profile.vad.max_speech_duration_seconds ?? Number.MAX_SAFE_INTEGER,
          speech_pad_ms: profile.vad.speech_pad_ms ?? 30,
          samples_overlap_seconds: profile.vad.samples_overlap_seconds ?? 0.1,
        }
      : { enabled: false },
  };
  const executionConfigSha256 = sha256Text(stableStringify(executionConfig));
  const revisionIdentity = {
    request_id: request.request_id,
    request_sha256: requestSha256,
    session_manifest_sha256: sessionManifestSha256,
    source_sha256: sourceBefore.sha256,
    fast_analysis_manifest_sha256: request.fast_analysis_manifest_sha256,
    semantic_run_sha256: request.semantic_selection.run_sha256,
    model_id: STRONG_MODEL_ID,
    model_sha1: modelBefore.sha1,
    model_sha256: modelBefore.sha256,
    execution_config_sha256: executionConfigSha256,
    windows,
  };
  const revisionId = `vbr_${sha256Text(stableStringify(revisionIdentity)).slice(0, 24)}`;
  const runId = `bounded_large-v3_${revisionId}`;
  const outputDir = path.join(sessionDir, profile.output_subdir, runId);
  const manifestPath = path.join(outputDir, "analysis_manifest.json");
  const chunksDir = path.join(outputDir, "chunks");
  const runAt = utcTimestamp(options.now);
  const revision = {
    revision_id: revisionId,
    revision_kind: "bounded_strong_asr_material_windows",
    append_only: true,
    coverage_scope: "approved_windows_only",
    canonical_status: "non_canonical_revision",
    request_id: request.request_id,
    request_ref: relativeRef(repoRoot, requestPath),
    request_sha256: requestSha256,
    fast_analysis_manifest_ref: request.fast_analysis_manifest_ref,
    fast_analysis_manifest_sha256: request.fast_analysis_manifest_sha256,
    semantic_run_id: request.semantic_selection.run_id,
    semantic_run_sha256: request.semantic_selection.run_sha256,
    execution_config_sha256: executionConfigSha256,
    window_count: windows.length,
    windows: windows.map((window) => ({
      window_id: window.window_id,
      start_seconds: window.start_seconds,
      duration_seconds: window.duration_seconds,
      source_unit_refs: [...window.source_unit_refs],
      importance_reason_codes: [...window.importance_reason_codes],
    })),
  };
  const canonicalPointerGuard = {
    session_manifest_sha256: sessionManifestSha256,
    canonical_run_id: canonical.run_id,
    canonical_transcript_ref: canonical.transcript_ref,
    canonical_transcript_jsonl_ref: canonical.transcript_jsonl_ref,
    preserved: true,
  };
  const plan = {
    schema_version: localAsrRunSchemaVersion,
    session_id: request.session_id,
    session_ref: request.session_ref,
    source_audio_ref: sourceAudioRef,
    source_sha256: sourceBefore.sha256,
    run_id: runId,
    engine: "whisper.cpp",
    model_id: STRONG_MODEL_ID,
    model_sha1: modelBefore.sha1,
    model_sha256: modelBefore.sha256,
    model_ref: requireSafeRelativeRef(strong.model_path, "bounded strong ASR model_path"),
    vad_enabled: Boolean(profile.vad?.enabled),
    vad_model_id: profile.vad?.enabled ? profile.vad.model_id ?? null : null,
    vad_model_ref: profile.vad?.enabled ? requireSafeRelativeRef(profile.vad.model_path, "bounded strong ASR VAD model_path") : null,
    vad_model_sha256: profile.vad?.enabled ? requireSha256(profile.vad.model_sha256, "bounded strong ASR VAD model SHA-256") : null,
    decoding: profile.decoding ?? null,
    repetition_filter: profile.repetition_filter ?? null,
    language: profile.language,
    chunk_count: windows.length,
    provider_transcript_used_as_input: false,
    speaker_identity_verified: false,
    output_ref: relativeRef(repoRoot, outputDir),
    recorded_at_local: sessionManifest.recorded_at_local ?? null,
    revision,
    canonical_pointer_guard: canonicalPointerGuard,
    boundaries: {
      partial_window_revision: true,
      canonical_whole_session_pointer_replaced: false,
      completion_notification_emitted: false,
      delivery_receipt_replaced: false,
      provider_transcript_used_as_authority: false,
      project_route_state: "candidate_only",
      official_task_mutated: false,
    },
  };
  if (!options.apply) {
    return {
      schema_version: "soulforge.voice_bounded_strong_asr_run_summary.v1",
      state: "planned",
      applied: false,
      feature_enabled: true,
      revision_id: revisionId,
      run_id: runId,
      approved_window_count: windows.length,
      approved_duration_seconds: roundMillis(windows.reduce((sum, window) => sum + window.duration_seconds, 0)),
      output_ref: plan.output_ref,
      canonical_whole_session_pointer_replaced: false,
      delivery_receipt_replaced: false,
      completion_notification_emitted: false,
      provider_payload_read: false,
      project_route_state: "candidate_only",
    };
  }

  await ensureWritableParentInside(sessionDir, manifestPath, "bounded strong ASR revision");
  const existingManifest = await readJsonIfExists(manifestPath);
  if (existingManifest?.state === "completed") {
    assertBoundedRevisionIdentity(existingManifest, plan);
    await verifyBoundedStrongAsrRevisionArtifacts(repoRoot, manifestPath, existingManifest);
    await recheckBoundedInputs({
      requestPath,
      requestSha256,
      sessionManifestPath,
      sessionManifestSha256,
      fastManifestPath,
      fastManifestSha256: request.fast_analysis_manifest_sha256,
      sourceAudioPath,
      sourceSha256: request.source_sha256,
      modelPath: strongModelPath,
      modelSha1: strong.model_sha1,
      vadModelPath,
      vadModelSha256: profile.vad?.enabled ? profile.vad.model_sha256 : null,
      inspectModel,
    });
    const continuity = await inspectVoiceHppContinuityCoverage({
      repoRoot,
      sessionDir,
      revisionManifestPath: manifestPath,
      apply: true,
      now: existingManifest.completed_at,
    });
    return buildBoundedStrongAsrSafeSummary(existingManifest, {
      applied: true,
      resumedCompleted: true,
      continuity,
    });
  }
  if (existingManifest) assertBoundedRevisionIdentity(existingManifest, plan);
  await assertBoundedOutputSurface(outputDir);
  await ensureWritableParentInside(outputDir, path.join(chunksDir, ".custody"), "bounded strong ASR chunks");
  await atomicWriteJsonInside(sessionDir, manifestPath, {
    ...plan,
    state: "in_progress",
    started_at: existingManifest?.started_at ?? runAt,
  });

  const runner = options.commandRunner ?? runCommand;
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "soulforge-bounded-strong-asr-"));
  let completedPublished = false;
  try {
    for (const [offset, approved] of windows.entries()) {
      const chunkIndex = offset + 1;
      const stem = `chunk_${String(chunkIndex).padStart(5, "0")}`;
      const outputBase = path.join(chunksDir, stem);
      const window = {
        chunk_index: chunkIndex,
        nominal_start_seconds: approved.start_seconds,
        nominal_end_seconds: roundMillis(approved.start_seconds + approved.duration_seconds),
        extract_start_seconds: approved.start_seconds,
        extract_duration_seconds: approved.duration_seconds,
      };
      if (await boundedChunkIsComplete(outputBase, approved, window)) continue;
      await removeBoundedChunkArtifacts(outputBase);
      await ensureWritableParentInside(sessionDir, `${outputBase}.json`, "bounded strong ASR chunk output");
      const wavPath = path.join(tempDir, `${stem}.wav`);
      runner(profile.ffmpeg_binary, [
        "-v", "error", "-y",
        "-ss", String(window.extract_start_seconds),
        "-t", String(window.extract_duration_seconds),
        "-i", sourceAudioPath,
        "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", wavPath,
      ], { cwd: repoRoot, label: "ffmpeg bounded strong ASR window extraction" });
      const whisperArgs = [
        "-m", path.resolve(repoRoot, strong.model_path),
        "-f", wavPath,
        "-l", profile.language,
        "-otxt", "-osrt", "-ojf", "-of", outputBase,
        "-np",
      ];
      appendWhisperOptions(whisperArgs, profile, repoRoot);
      runner(profile.asr_binary, whisperArgs, { cwd: repoRoot, label: "whisper.cpp bounded strong transcription" });
      const outputBytes = await readStableBytes(`${outputBase}.json`);
      const parsed = JSON.parse(outputBytes.toString("utf8"));
      const [textArtifact, srtArtifact] = await Promise.all([
        inspectStableFile(`${outputBase}.txt`),
        inspectStableFile(`${outputBase}.srt`),
      ]);
      await atomicWriteJsonInside(sessionDir, `${outputBase}.complete.json`, {
        schema_version: "soulforge.local_asr_chunk_receipt.v0",
        chunk_index: chunkIndex,
        request_window_id: approved.window_id,
        window,
        segment_count: Array.isArray(parsed.transcription) ? parsed.transcription.length : 0,
        artifact_hashes: {
          json_sha256: sha256Bytes(outputBytes),
          text_sha256: textArtifact.sha256,
          srt_sha256: srtArtifact.sha256,
        },
        completed_at: runAt,
      });
      await fs.rm(wavPath, { force: true });
    }

    await recheckBoundedInputs({
      requestPath,
      requestSha256,
      sessionManifestPath,
      sessionManifestSha256,
      fastManifestPath,
      fastManifestSha256: request.fast_analysis_manifest_sha256,
      sourceAudioPath,
      sourceSha256: request.source_sha256,
      modelPath: strongModelPath,
      modelSha1: strong.model_sha1,
      vadModelPath,
      vadModelSha256: profile.vad?.enabled ? profile.vad.model_sha256 : null,
      inspectModel,
    });
    const segments = [];
    for (const [offset, approved] of windows.entries()) {
      const chunkIndex = offset + 1;
      const stem = `chunk_${String(chunkIndex).padStart(5, "0")}`;
      const receipt = JSON.parse(await fs.readFile(path.join(chunksDir, `${stem}.complete.json`), "utf8"));
      if (receipt.request_window_id !== approved.window_id) throw new Error(`bounded strong ASR chunk receipt window mismatch: ${chunkIndex}`);
      const parsed = JSON.parse(await fs.readFile(path.join(chunksDir, `${stem}.json`), "utf8"));
      segments.push(...parseWhisperJson(parsed, receipt.window, { runId }));
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
    await atomicWriteTextInside(sessionDir, path.join(outputDir, "transcript.jsonl"), transcriptJsonl);
    await atomicWriteTextInside(sessionDir, path.join(outputDir, "transcript.txt"), transcriptText);
    await atomicWriteTextInside(sessionDir, path.join(outputDir, "suppressed_segments.jsonl"), suppressedJsonl);
    const qualityMetrics = buildTranscriptQualityMetrics(filtered.kept, filtered.suppressed);
    const completedManifest = {
      ...plan,
      state: "completed",
      segment_count: filtered.kept.length,
      suppressed_segment_ref: relativeRef(repoRoot, path.join(outputDir, "suppressed_segments.jsonl")),
      quality_metrics: qualityMetrics,
      transcript_ref: relativeRef(repoRoot, path.join(outputDir, "transcript.txt")),
      transcript_jsonl_ref: relativeRef(repoRoot, path.join(outputDir, "transcript.jsonl")),
      transcript_sha256: sha256Text(transcriptJsonl),
      evidence_role: STRONG_EVIDENCE_ROLE,
      quality: qualityMetrics.flags.length > 0
        ? "machine_transcript_unverified_attention_required"
        : "machine_transcript_unverified",
      claim_ceiling: "observed",
      completed_at: runAt,
    };
    const validation = validateBoundedStrongAsrRevision(completedManifest);
    if (!validation.ok) throw new Error(`bounded strong ASR revision validation failed: ${validation.errors.join("; ")}`);
    await verifyBoundedStrongAsrRevisionArtifacts(repoRoot, manifestPath, completedManifest);
    await atomicWriteJsonInside(sessionDir, manifestPath, completedManifest);
    completedPublished = true;
    const continuity = await inspectVoiceHppContinuityCoverage({
      repoRoot,
      sessionDir,
      revisionManifestPath: manifestPath,
      apply: true,
      now: runAt,
    });
    return buildBoundedStrongAsrSafeSummary(completedManifest, {
      applied: true,
      resumedCompleted: false,
      continuity,
    });
  } catch (error) {
    if (!completedPublished) {
      await atomicWriteJsonInside(sessionDir, manifestPath, {
        ...plan,
        state: "retryable_failure",
        started_at: existingManifest?.started_at ?? runAt,
        failure_kind: classifyBoundedStrongFailure(error),
        failed_at: runAt,
      });
    }
    throw error;
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

export function validateBoundedStrongAsrRevision(manifest) {
  const errors = [];
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) return { ok: false, errors: ["revision manifest must be an object"] };
  if (!validateBoundedStrongAsrRevisionSchema(manifest)) {
    appendSchemaValidationErrors(errors, validateBoundedStrongAsrRevisionSchema.errors);
  }
  if (manifest.schema_version !== localAsrRunSchemaVersion || manifest.state !== "completed") errors.push("revision schema or state mismatch");
  if (!SAFE_ID_PATTERN.test(String(manifest.session_id ?? ""))) errors.push("revision session_id is invalid");
  if (!/^bounded_large-v3_vbr_[a-f0-9]{24}$/u.test(String(manifest.run_id ?? ""))) errors.push("revision run_id is invalid");
  if (manifest.engine !== "whisper.cpp" || manifest.model_id !== STRONG_MODEL_ID) errors.push("revision strong model identity mismatch");
  if (!SHA1_PATTERN.test(String(manifest.model_sha1 ?? "")) || manifest.model_sha256 !== STRONG_MODEL_SHA256) errors.push("revision strong model digest mismatch");
  if (manifest.evidence_role !== STRONG_EVIDENCE_ROLE || manifest.claim_ceiling !== "observed") errors.push("revision evidence role or claim ceiling mismatch");
  if (!Number.isSafeInteger(manifest.chunk_count) || manifest.chunk_count < 1 || manifest.chunk_count > 16) errors.push("revision chunk_count is invalid");
  if (!Number.isSafeInteger(manifest.segment_count) || manifest.segment_count < 0) errors.push("revision segment_count is invalid");
  if (!SHA256_PATTERN.test(String(manifest.transcript_sha256 ?? ""))) errors.push("revision transcript_sha256 is invalid");
  if (!isStrictUtcTimestamp(manifest.completed_at)) errors.push("revision completed_at must be strict UTC");
  for (const [name, value] of [
    ["session_ref", manifest.session_ref],
    ["source_audio_ref", manifest.source_audio_ref],
    ["model_ref", manifest.model_ref],
    ["output_ref", manifest.output_ref],
    ["transcript_ref", manifest.transcript_ref],
    ["transcript_jsonl_ref", manifest.transcript_jsonl_ref],
    ["suppressed_segment_ref", manifest.suppressed_segment_ref],
  ]) {
    if (!isSafeRelativeRef(value)) errors.push(`revision ${name} must be a safe relative ref`);
  }
  if (!/^vbr_[a-f0-9]{24}$/u.test(String(manifest.revision?.revision_id ?? ""))
    || manifest.run_id !== `bounded_large-v3_${manifest.revision?.revision_id}`) errors.push("revision identity mismatch");
  if (manifest.revision?.append_only !== true
    || manifest.revision?.coverage_scope !== "approved_windows_only"
    || manifest.revision?.canonical_status !== "non_canonical_revision") errors.push("revision append-only scope mismatch");
  if (manifest?.revision?.window_count !== manifest?.chunk_count
    || manifest?.revision?.windows?.length !== manifest?.chunk_count) {
    errors.push("revision window_count must equal chunk_count");
  }
  if (manifest?.boundaries?.partial_window_revision !== true
    || manifest?.revision?.canonical_status !== "non_canonical_revision"
    || manifest?.canonical_pointer_guard?.preserved !== true) {
    errors.push("bounded revision must remain non-canonical");
  }
  scanForbiddenMetadataKeys(manifest, [], errors);
  return { ok: errors.length === 0, errors: [...new Set(errors)] };
}

export async function inspectVoiceHppContinuityCoverage(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const sessionDir = path.resolve(options.sessionDir ?? "");
  const revisionManifestPath = path.resolve(options.revisionManifestPath ?? "");
  const voiceRoot = path.join(repoRoot, "_workspaces", "system", "voice_capture");
  await assertExistingInside(voiceRoot, sessionDir, "HPP continuity session");
  await assertExistingInside(sessionDir, revisionManifestPath, "HPP continuity revision");
  const sessionManifestPath = path.join(sessionDir, "session_manifest.json");
  const [sessionBytes, revisionBytes] = await Promise.all([
    readStableBytes(sessionManifestPath),
    readStableBytes(revisionManifestPath),
  ]);
  const sessionManifest = JSON.parse(sessionBytes.toString("utf8"));
  const revisionManifest = JSON.parse(revisionBytes.toString("utf8"));
  const revisionValidation = validateBoundedStrongAsrRevision(revisionManifest);
  if (!revisionValidation.ok) throw new Error(`bounded strong ASR revision validation failed: ${revisionValidation.errors.join("; ")}`);
  const artifactSet = await verifyBoundedStrongAsrRevisionArtifacts(repoRoot, revisionManifestPath, revisionManifest);
  const sessionId = requireSafeId(sessionManifest.session_id ?? path.basename(sessionDir), "session_id");
  const recordingId = requireSafeId(sessionManifest.recording_id ?? sessionId, "recording_id");
  const sourceRef = requireSafeRelativeRef(sessionManifest.audio?.ref, "session source audio ref");
  const sourcePath = path.resolve(repoRoot, sourceRef);
  const sourceExpectedSha256 = requireSha256(sessionManifest.source_sha256 ?? sessionManifest.audio?.sha256, "session source SHA-256");
  const sourceObserved = await inspectStableFile(sourcePath);
  const rawCheck = artifactCheck(
    sourceObserved.sha256 === sourceExpectedSha256 ? "verified" : "mismatch",
    sourceRef,
    sourceObserved,
  );
  const sessionObserved = {
    sha256: sha256Bytes(sessionBytes),
    size: sessionBytes.length,
  };
  const sessionCheck = artifactCheck(
    sessionObserved.sha256 === revisionManifest.canonical_pointer_guard.session_manifest_sha256
      ? "verified"
      : "mismatch",
    relativeRef(repoRoot, sessionManifestPath),
    sessionObserved,
  );
  const recordingDate = path.basename(path.dirname(sessionDir));
  const libraryRef = `_workspaces/system/voice_capture/library/recordings/${recordingDate}/${recordingId}/recording_manifest.json`;
  const libraryCheck = await inspectLibraryContinuity(repoRoot, libraryRef, {
    sessionId,
    sessionRef: relativeRef(repoRoot, sessionDir),
    sourceRef,
    sourceSha256: sourceExpectedSha256,
  });
  const receiptRef = producerReceiptRef(sessionId);
  const producerCheck = await inspectProducerReceiptContinuity(repoRoot, receiptRef, {
    sessionId,
    sourceRef,
    sessionManifestRef: relativeRef(repoRoot, sessionManifestPath),
    libraryRef,
  });
  const revisionObserved = {
    sha256: sha256Bytes(revisionBytes),
    size: revisionBytes.length,
  };
  const revisionCheck = artifactCheck("verified", relativeRef(repoRoot, revisionManifestPath), revisionObserved);
  const catchUpVerified = rawCheck.state === "verified"
    && sessionCheck.state === "verified"
    && revisionCheck.state === "verified"
    && artifactSet.verified === true;
  const checks = {
    raw_source: rawCheck,
    session_manifest: sessionCheck,
    library_manifest: libraryCheck,
    producer_receipt: producerCheck,
    bounded_revision: revisionCheck,
    catch_up_restart: {
      state: catchUpVerified ? "verified" : "gap",
      deterministic_revision_identity_verified: revisionManifest.run_id === `bounded_large-v3_${revisionManifest.revision.revision_id}`,
      completed_artifact_receipts_verified: artifactSet.verified === true,
      canonical_whole_session_pointer_preserved: sessionCheck.state === "verified",
      retry_creates_new_revision: false,
    },
  };
  const gapCodes = [];
  for (const [name, check] of Object.entries(checks)) {
    if (check.state !== "verified") gapCodes.push(`${name}_${check.state}`);
  }
  const identityBody = {
    session_id: sessionId,
    recording_id: recordingId,
    revision_id: revisionManifest.revision.revision_id,
    state: gapCodes.length === 0 ? "complete" : "gaps_detected",
    gap_codes: gapCodes.sort(),
    checks,
    project_route_state: "candidate_only",
    boundaries: {
      metadata_only: true,
      transcript_body_copied: false,
      audio_body_copied: false,
      absolute_path_copied: false,
      provider_transcript_authority: "none",
      accepted_project_route_created: false,
      official_task_mutated: false,
    },
  };
  const receipt = {
    schema_version: voiceHppContinuityReceiptSchemaVersion,
    coverage_id: `vhc_${sha256Text(stableStringify(identityBody)).slice(0, 24)}`,
    checked_at: utcTimestamp(options.now),
    ...identityBody,
  };
  const validationErrors = validateHppContinuityReceiptShape(receipt);
  scanForbiddenMetadataKeys(receipt, [], validationErrors);
  if (validationErrors.length > 0) {
    throw new Error(`HPP voice continuity receipt validation failed: ${validationErrors.join("; ")}`);
  }
  const receiptPath = path.join(path.dirname(revisionManifestPath), "hpp_continuity_receipt.json");
  let write = { applied: false, changed: false };
  if (options.apply) {
    await ensureWritableParentInside(sessionDir, receiptPath, "HPP voice continuity receipt");
    write = await writeJsonPreservingTimestamp(receiptPath, receipt, "checked_at");
  }
  return {
    applied: write.applied,
    changed: write.changed,
    receipt_ref: relativeRef(repoRoot, receiptPath),
    receipt,
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
  const extractStart = Number(window?.extract_start_seconds);
  const extractDuration = Number(window?.extract_duration_seconds);
  const nominalStart = Number(window?.nominal_start_seconds);
  const nominalEnd = Number(window?.nominal_end_seconds);
  if (!Number.isFinite(extractStart) || extractStart < 0
    || !Number.isFinite(extractDuration) || extractDuration <= 0
    || !Number.isFinite(nominalStart) || !Number.isFinite(nominalEnd)
    || nominalStart < extractStart || nominalEnd < nominalStart
    || nominalEnd > extractStart + extractDuration) {
    throw new Error("ASR chunk window bounds are invalid");
  }
  const rows = [];
  for (const segment of payload?.transcription ?? []) {
    const text = String(segment?.text ?? "").trim();
    if (!text) continue;
    const localStart = Number(segment?.offsets?.from) / 1000;
    const localEnd = Number(segment?.offsets?.to) / 1000;
    if (!Number.isFinite(localStart) || !Number.isFinite(localEnd)
      || localStart < 0 || localEnd < localStart || localEnd > extractDuration) {
      throw new Error("ASR segment offsets must be finite, ordered, and contained in the extraction window");
    }
    const start = extractStart + localStart;
    const end = extractStart + localEnd;
    const midpoint = (start + end) / 2;
    if (midpoint < nominalStart || midpoint >= nominalEnd) continue;
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
      asr_confidence: summarizeTokenProbabilities(segment?.tokens),
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
  const tokenProbabilityCount = kept.reduce((count, segment) => count + Number(segment.asr_confidence?.token_probability_count ?? 0), 0);
  const weightedProbabilitySum = kept.reduce((sum, segment) => {
    const count = Number(segment.asr_confidence?.token_probability_count ?? 0);
    const mean = Number(segment.asr_confidence?.mean_token_probability ?? 0);
    return sum + count * mean;
  }, 0);
  const lowProbabilityTokenCount = kept.reduce((count, segment) => count + Number(segment.asr_confidence?.low_probability_token_count ?? 0), 0);
  const meanTokenProbability = tokenProbabilityCount > 0 ? weightedProbabilitySum / tokenProbabilityCount : null;
  const lowProbabilityTokenRatio = tokenProbabilityCount > 0 ? lowProbabilityTokenCount / tokenProbabilityCount : null;
  const flags = [];
  if (rawCount >= 20 && suppressedRatio >= 0.2) flags.push("high_exact_repetition_suppressed");
  if (kept.length === 0) flags.push("no_speech_transcript_segments");
  if (tokenProbabilityCount > 0 && (meanTokenProbability < 0.65 || lowProbabilityTokenRatio >= 0.2)) flags.push("low_token_probability_signal");
  return {
    raw_segment_count: rawCount,
    retained_segment_count: kept.length,
    suppressed_segment_count: suppressed.length,
    unique_raw_text_count: uniqueCount,
    suppressed_segment_ratio: roundRatio(suppressedRatio),
    token_probability_state: tokenProbabilityCount > 0 ? "available_uncalibrated" : "unavailable",
    token_probability_count: tokenProbabilityCount,
    mean_token_probability: meanTokenProbability == null ? null : roundRatio(meanTokenProbability),
    low_probability_token_count: lowProbabilityTokenCount,
    low_probability_token_ratio: lowProbabilityTokenRatio == null ? null : roundRatio(lowProbabilityTokenRatio),
    flags,
  };
}

export function summarizeTokenProbabilities(tokens) {
  const probabilities = Array.isArray(tokens)
    ? tokens.map((token) => Number(token?.p)).filter((value) => Number.isFinite(value) && value >= 0 && value <= 1)
    : [];
  if (probabilities.length === 0) {
    return {
      state: "unavailable",
      token_probability_count: 0,
      mean_token_probability: null,
      minimum_token_probability: null,
      low_probability_token_count: 0,
    };
  }
  const mean = probabilities.reduce((sum, value) => sum + value, 0) / probabilities.length;
  return {
    state: "available_uncalibrated",
    token_probability_count: probabilities.length,
    mean_token_probability: roundRatio(mean),
    minimum_token_probability: roundRatio(Math.min(...probabilities)),
    low_probability_token_count: probabilities.filter((value) => value < 0.5).length,
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
      source_sha256: resumableManifest.source_sha256,
      run_id: resumableManifest.run_id,
      engine: resumableManifest.engine,
      model_id: resumableManifest.model_id,
      model_sha1: resumableManifest.model_sha1 ?? null,
      evidence_role: resumableManifest.evidence_role,
      transcript_ref: resumableManifest.transcript_ref,
      transcript_jsonl_ref: resumableManifest.transcript_jsonl_ref,
      segment_count: resumableManifest.segment_count,
      completed_at: resumableManifest.completed_at,
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

  if (!existingManifest || !completionIdentityMatches(existingManifest, plan)) {
    await fs.rm(chunksDir, { recursive: true, force: true });
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
        "-otxt", "-osrt", "-ojf", "-of", outputBase,
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
      source_sha256: plan.source_sha256,
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
  const analysisCompleted = analysisManifest?.state === "completed"
    && completionIdentityMatches(analysisManifest, plan);
  const sessionCompleted = sessionState.status === "completed"
    && completionIdentityMatches(sessionState, plan);
  if (!analysisCompleted && !sessionCompleted) return null;
  const completedState = analysisCompleted ? analysisManifest : sessionState;
  const transcriptRef = completedState.transcript_ref ?? null;
  const transcriptJsonlRef = completedState.transcript_jsonl_ref ?? null;
  if (!transcriptRef || !transcriptJsonlRef) return null;
  const transcriptPath = resolveRepoPath(repoRoot, transcriptRef);
  const transcriptJsonlPath = resolveRepoPath(repoRoot, transcriptJsonlRef);
  if (!isInside(repoRoot, transcriptPath) || !isInside(repoRoot, transcriptJsonlPath)) return null;
  if (!existsSync(transcriptPath) || !existsSync(transcriptJsonlPath)) return null;
  if (analysisCompleted) return analysisManifest;

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

function completionIdentityMatches(candidate, plan) {
  return Boolean(candidate?.source_sha256)
    && candidate.source_sha256 === plan.source_sha256
    && candidate.run_id === plan.run_id
    && candidate.engine === plan.engine
    && candidate.model_id === plan.model_id
    && (candidate.model_sha1 ?? null) === (plan.model_sha1 ?? null);
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

function validateFastAnalysisManifest(manifest) {
  if (manifest?.state !== "completed") throw new Error("fast analysis manifest must be completed");
  requireSafeId(manifest.session_id, "fast session_id");
  requireSafeId(manifest.run_id, "fast run_id");
  if (manifest.engine !== "whisper.cpp") throw new Error("fast analysis engine must be whisper.cpp");
  if (manifest.model_id !== FAST_MODEL_ID) throw new Error("fast analysis model_id mismatch");
  if (manifest.evidence_role !== FAST_EVIDENCE_ROLE) throw new Error("fast analysis evidence role mismatch");
  requireSha256(manifest.source_sha256, "fast source SHA-256");
  requireSha256(manifest.transcript_sha256, "fast transcript SHA-256");
  requireSafeRelativeRef(manifest.source_audio_ref, "fast source audio ref");
  requireSafeRelativeRef(manifest.transcript_ref, "fast transcript ref");
  requireSafeRelativeRef(manifest.transcript_jsonl_ref, "fast transcript JSONL ref");
}

function validateCanonicalFastBinding(repoRoot, sessionDir, sessionManifest, fast, fastManifestPath) {
  const sessionId = requireSafeId(sessionManifest.session_id ?? path.basename(sessionDir), "session_id");
  if (fast.session_id !== sessionId) throw new Error("fast analysis session identity mismatch");
  const sourceRef = requireSafeRelativeRef(sessionManifest.audio?.ref, "session source audio ref");
  if (fast.source_audio_ref !== sourceRef) throw new Error("fast analysis source audio ref mismatch");
  const sourceSha256 = requireSha256(sessionManifest.source_sha256 ?? sessionManifest.audio?.sha256, "session source SHA-256");
  if (fast.source_sha256 !== sourceSha256) throw new Error("fast analysis source SHA-256 mismatch");
  const canonical = sessionManifest.independent_transcription;
  if (canonical?.status !== "completed") throw new Error("canonical whole-session independent transcription must be completed");
  if (canonical.run_id !== fast.run_id
    || canonical.transcript_ref !== fast.transcript_ref
    || canonical.transcript_jsonl_ref !== fast.transcript_jsonl_ref) {
    throw new Error("fast analysis manifest is not the canonical whole-session independent transcription");
  }
  const expectedFastPath = path.join(sessionDir, "analysis", "local_asr", fast.run_id, "analysis_manifest.json");
  if (path.resolve(fastManifestPath) !== path.resolve(expectedFastPath)) {
    throw new Error("fast analysis manifest is outside its canonical run directory");
  }
}

function validateFastSemanticSelection(run, fast) {
  if (!run || typeof run !== "object" || Array.isArray(run)) throw new Error("semanticRun is required");
  if (run.schema_version !== "soulforge.voice_semantic_label_run.v1") throw new Error("semantic selection schema mismatch");
  if (run.recording_ref?.recording_id !== fast.session_id) throw new Error("semantic selection session mismatch");
  if (run.recording_ref?.transcript_ref !== fast.transcript_jsonl_ref
    || run.recording_ref?.transcript_sha256 !== fast.transcript_sha256) {
    throw new Error("semantic selection transcript binding mismatch");
  }
  if (run.recording_ref?.evidence_role !== FAST_EVIDENCE_ROLE
    || run.evidence_gate?.input_class !== "independent_asr_fast"
    || run.evidence_gate?.state !== "stronger_local_asr_required") {
    throw new Error("semantic selection is not a fast-ASR material escalation");
  }
  if (run.evidence_gate?.action_candidate_emission_allowed !== false
    || run.evidence_gate?.project_candidate_emission_allowed !== false) {
    throw new Error("fast semantic selection cannot emit action or project candidates");
  }
  if (run.engine?.engine_id !== "soulforge_voice_semantic_baseline"
    || !SHA256_PATTERN.test(String(run.engine?.ruleset_sha256 ?? ""))) {
    throw new Error("semantic selection engine identity is invalid");
  }
  if (!Array.isArray(run.review_windows) || run.review_windows.length === 0) {
    throw new Error("semantic selection contains no material strong-ASR windows");
  }
  if (run.boundaries?.ambiguous_trivial_content_ignored !== true
    || run.boundaries?.provider_transcript_authority_zero !== true) {
    throw new Error("semantic selection boundaries are invalid");
  }
}

function normalizeApprovedWindows(values, options = {}) {
  if (!Array.isArray(values) || values.length === 0) throw new Error("at least one approved material window is required");
  const maxWindows = Number(options.maxWindows);
  if (!Number.isSafeInteger(maxWindows) || maxWindows < 1 || maxWindows > 16) {
    throw new Error("bounded strong ASR max window count must be between 1 and 16");
  }
  if (values.length > 256) throw new Error("semantic material window input exceeds the bounded normalization limit");
  const durationSeconds = Number(options.durationSeconds);
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) throw new Error("session duration must be positive");
  const candidates = values.map((window) => ({
    window_id: String(window?.window_id ?? ""),
    start_seconds: roundMillis(Number(window?.start_seconds)),
    duration_seconds: roundMillis(Number(window?.duration_seconds)),
    source_unit_refs: [...new Set((window?.source_unit_refs ?? []).map(String))].sort(),
    importance_state: window?.importance_state,
    importance_reason_codes: [...new Set((window?.importance_reason_codes ?? []).map(String))].sort(),
    escalation_state: window?.escalation_state,
    human_listen_required: window?.human_listen_required,
    transcript_text_copied: window?.transcript_text_copied,
  })).sort(compareApprovedWindows);
  for (const candidate of candidates) {
    const candidateValidation = validateBoundedStrongAsrRequest(buildWindowValidationRequest([candidate]));
    const candidateErrors = candidateValidation.errors.filter((error) => !error.includes("request_id does not match"));
    if (candidateErrors.length > 0) {
      throw new Error(`approved material window is invalid: ${candidateErrors.join("; ")}`);
    }
    if (candidate.start_seconds >= durationSeconds) {
      throw new Error(`approved window ${candidate.window_id} starts outside session duration`);
    }
  }
  if (durationSeconds < 30) throw new Error("session duration is too short for a bounded 30-second material window");

  const adjusted = candidates.map((candidate) => {
    const originalEnd = candidate.start_seconds + candidate.duration_seconds;
    const end = roundMillis(Math.min(originalEnd, durationSeconds));
    const start = roundMillis(Math.min(candidate.start_seconds, Math.max(0, end - 30)));
    return {
      ...candidate,
      start_seconds: start,
      duration_seconds: roundMillis(end - start),
      source_window_ids: [candidate.window_id],
      bounds_changed: start !== candidate.start_seconds || end !== originalEnd,
    };
  });
  const clusters = [];
  for (const candidate of adjusted) {
    const candidateEnd = roundMillis(candidate.start_seconds + candidate.duration_seconds);
    const previous = clusters.at(-1);
    if (!previous || candidate.start_seconds >= previous.end_seconds) {
      clusters.push({
        start_seconds: candidate.start_seconds,
        end_seconds: candidateEnd,
        members: [candidate],
      });
    } else {
      previous.end_seconds = Math.max(previous.end_seconds, candidateEnd);
      previous.members.push(candidate);
    }
  }
  const windows = [];
  for (const cluster of clusters) {
    const span = roundMillis(cluster.end_seconds - cluster.start_seconds);
    const partCount = Math.max(1, Math.ceil(span / 90));
    for (let partIndex = 0; partIndex < partCount; partIndex += 1) {
      const partStart = roundMillis(cluster.start_seconds + (span * partIndex) / partCount);
      const partEnd = partIndex === partCount - 1
        ? cluster.end_seconds
        : roundMillis(cluster.start_seconds + (span * (partIndex + 1)) / partCount);
      const members = cluster.members.filter((member) => (
        member.start_seconds < partEnd
        && member.start_seconds + member.duration_seconds > partStart
      ));
      const sourceUnitRefs = [...new Set(members.flatMap((member) => member.source_unit_refs))].sort();
      const importanceReasonCodes = [...new Set(members.flatMap((member) => member.importance_reason_codes))].sort();
      const sourceWindowIds = [...new Set(members.flatMap((member) => member.source_window_ids))].sort();
      const duration = roundMillis(partEnd - partStart);
      const preserveOriginalId = members.length === 1
        && partCount === 1
        && members[0].bounds_changed === false;
      const identity = {
        start_seconds: partStart,
        duration_seconds: duration,
        source_unit_refs: sourceUnitRefs,
        importance_reason_codes: importanceReasonCodes,
        source_window_ids: sourceWindowIds,
      };
      windows.push({
        window_id: preserveOriginalId
          ? members[0].window_id
          : `vrw_${sha256Text(stableStringify(identity)).slice(0, 24)}`,
        start_seconds: partStart,
        duration_seconds: duration,
        source_unit_refs: sourceUnitRefs,
        importance_state: "material_ambiguity_candidate",
        importance_reason_codes: importanceReasonCodes,
        escalation_state: "stronger_local_asr_required",
        human_listen_required: false,
        transcript_text_copied: false,
      });
    }
  }
  if (windows.length > maxWindows) throw new Error("normalized approved material window count exceeds the configured bound");
  const validation = validateBoundedStrongAsrRequest(buildWindowValidationRequest(windows));
  const structuralErrors = validation.errors.filter((error) => !error.includes("request_id does not match"));
  if (structuralErrors.length > 0) throw new Error(`approved material windows are invalid: ${structuralErrors.join("; ")}`);
  return windows;
}

function buildWindowValidationRequest(windows) {
  return {
    schema_version: boundedStrongAsrRequestSchemaVersion,
    request_id: `vsq_${"0".repeat(24)}`,
    created_at: "2000-01-01T00:00:00.000Z",
    session_id: "validation_only",
    session_ref: "_workspaces/system/voice_capture/sessions/validation_only",
    source_audio_ref: "_workspaces/system/voice_capture/sessions/validation_only/audio/source.wav",
    source_sha256: "0".repeat(64),
    fast_analysis_manifest_ref: "_workspaces/system/voice_capture/sessions/validation_only/analysis/local_asr/fast/analysis_manifest.json",
    fast_analysis_manifest_sha256: "0".repeat(64),
    semantic_selection: {
      run_id: `vsl_${"0".repeat(24)}`,
      run_sha256: "0".repeat(64),
      engine_id: "soulforge_voice_semantic_baseline",
      engine_version: "validation",
      ruleset_sha256: "0".repeat(64),
      evidence_gate_state: "stronger_local_asr_required",
    },
    approval: {
      state: "approved",
      approved_by: "validation_only",
      approved_at: "2000-01-01T00:00:00.000Z",
      scope: "exact_material_windows_only",
    },
    windows,
    project_route_state: "candidate_only",
    boundaries: {
      provider_transcript_authority: "none",
      transcript_text_copied: false,
      human_acceptance_fabricated: false,
      canonical_whole_session_pointer_mutation_allowed: false,
      completion_notification_allowed: false,
      delivery_receipt_replacement_allowed: false,
    },
  };
}

function compareApprovedWindows(left, right) {
  return Number(left.start_seconds) - Number(right.start_seconds)
    || Number(left.duration_seconds) - Number(right.duration_seconds)
    || String(left.window_id).localeCompare(String(right.window_id));
}

function validateStrongProfile(strong) {
  if (strong.model_id !== STRONG_MODEL_ID) throw new Error("bounded strong ASR model_id mismatch");
  if (strong.model_sha256 !== STRONG_MODEL_SHA256) throw new Error("bounded strong ASR approved model SHA-256 mismatch");
  if (!SHA1_PATTERN.test(String(strong.model_sha1 ?? ""))) throw new Error("bounded strong ASR model SHA-1 is required");
  if (strong.evidence_role !== STRONG_EVIDENCE_ROLE) throw new Error("bounded strong ASR evidence role mismatch");
  if (!isSafeRelativeRef(strong.model_path)
    || !String(strong.model_path).startsWith("_workspaces/system/voice_capture/models/")) {
    throw new Error("bounded strong ASR model_path must be a safe voice model ref");
  }
  const maxWindows = Number(strong.max_windows_per_request ?? 16);
  if (!Number.isSafeInteger(maxWindows) || maxWindows < 1 || maxWindows > 16) {
    throw new Error("bounded strong ASR max_windows_per_request must be between 1 and 16");
  }
}

function validateRequestBindings(repoRoot, request, requestSha256, sessionDir, sessionManifest, sessionBytes, fast, fastBytes) {
  if (!SHA256_PATTERN.test(requestSha256)) throw new Error("bounded strong ASR request SHA-256 is invalid");
  if (request.session_ref !== relativeRef(repoRoot, sessionDir)) throw new Error("bounded strong ASR request session_ref mismatch");
  const sessionId = requireSafeId(sessionManifest.session_id ?? path.basename(sessionDir), "session_id");
  if (request.session_id !== sessionId || request.session_id !== fast.session_id) throw new Error("bounded strong ASR request session identity mismatch");
  const sourceRef = requireSafeRelativeRef(sessionManifest.audio?.ref, "session source audio ref");
  const sourceSha256 = requireSha256(sessionManifest.source_sha256 ?? sessionManifest.audio?.sha256, "session source SHA-256");
  if (request.source_audio_ref !== sourceRef || request.source_sha256 !== sourceSha256) {
    throw new Error("bounded strong ASR request source binding mismatch");
  }
  if (request.fast_analysis_manifest_sha256 !== sha256Bytes(fastBytes)) {
    throw new Error("bounded strong ASR request fast manifest digest mismatch");
  }
  if (sessionManifest.independent_transcription?.run_id !== fast.run_id) {
    throw new Error("bounded strong ASR request fast manifest is no longer canonical");
  }
  if (!SHA256_PATTERN.test(sha256Bytes(sessionBytes))) throw new Error("session manifest digest could not be computed");
}

function assertBoundedRevisionIdentity(existing, plan) {
  const matches = existing?.schema_version === plan.schema_version
    && existing.session_id === plan.session_id
    && existing.session_ref === plan.session_ref
    && existing.source_audio_ref === plan.source_audio_ref
    && existing.source_sha256 === plan.source_sha256
    && existing.run_id === plan.run_id
    && existing.model_id === plan.model_id
    && existing.model_sha1 === plan.model_sha1
    && existing.model_sha256 === plan.model_sha256
    && existing.output_ref === plan.output_ref
    && existing.revision?.revision_id === plan.revision.revision_id
    && existing.revision?.request_id === plan.revision.request_id
    && existing.revision?.request_sha256 === plan.revision.request_sha256
    && existing.revision?.fast_analysis_manifest_sha256 === plan.revision.fast_analysis_manifest_sha256
    && existing.revision?.semantic_run_sha256 === plan.revision.semantic_run_sha256
    && existing.revision?.execution_config_sha256 === plan.revision.execution_config_sha256
    && stableStringify(existing.revision?.windows) === stableStringify(plan.revision.windows)
    && stableStringify(existing.canonical_pointer_guard) === stableStringify(plan.canonical_pointer_guard);
  if (!matches) throw new Error("bounded strong ASR append-only revision identity conflict");
}

async function verifyBoundedStrongAsrRevisionArtifacts(repoRoot, manifestPath, manifest) {
  const validation = validateBoundedStrongAsrRevision(manifest);
  if (!validation.ok) throw new Error(`bounded strong ASR revision validation failed: ${validation.errors.join("; ")}`);
  const outputDir = path.dirname(manifestPath);
  const chunksDir = path.join(outputDir, "chunks");
  await assertExistingInside(outputDir, chunksDir, "bounded strong ASR chunks");
  const expectedNames = new Set();
  for (let index = 1; index <= manifest.chunk_count; index += 1) {
    const stem = `chunk_${String(index).padStart(5, "0")}`;
    for (const suffix of [".json", ".complete.json", ".txt", ".srt"]) expectedNames.add(`${stem}${suffix}`);
  }
  const entries = await fs.readdir(chunksDir, { withFileTypes: true });
  const observedNames = new Set(entries.filter((entry) => entry.isFile()).map((entry) => entry.name));
  if (entries.some((entry) => !entry.isFile() || !expectedNames.has(entry.name))
    || expectedNames.size !== observedNames.size
    || [...expectedNames].some((name) => !observedNames.has(name))) {
    throw new Error("bounded strong ASR chunk artifact set mismatch");
  }
  const segments = [];
  const artifactRows = [];
  for (let index = 1; index <= manifest.chunk_count; index += 1) {
    const stem = `chunk_${String(index).padStart(5, "0")}`;
    const outputBase = path.join(chunksDir, stem);
    const outputBytes = await readStableBytes(`${outputBase}.json`);
    const receiptBytes = await readStableBytes(`${outputBase}.complete.json`);
    const parsed = JSON.parse(outputBytes.toString("utf8"));
    const receipt = JSON.parse(receiptBytes.toString("utf8"));
    const expectedWindow = manifest.revision.windows[index - 1];
    if (receipt.schema_version !== "soulforge.local_asr_chunk_receipt.v0"
      || receipt.chunk_index !== index
      || receipt.request_window_id !== expectedWindow.window_id) {
      throw new Error(`bounded strong ASR chunk receipt identity mismatch: ${index}`);
    }
    const expectedRuntimeWindow = {
      chunk_index: index,
      nominal_start_seconds: expectedWindow.start_seconds,
      nominal_end_seconds: roundMillis(expectedWindow.start_seconds + expectedWindow.duration_seconds),
      extract_start_seconds: expectedWindow.start_seconds,
      extract_duration_seconds: expectedWindow.duration_seconds,
    };
    if (stableStringify(receipt.window) !== stableStringify(expectedRuntimeWindow)) {
      throw new Error(`bounded strong ASR chunk receipt bounds mismatch: ${index}`);
    }
    if (receipt.segment_count !== (Array.isArray(parsed.transcription) ? parsed.transcription.length : 0)) {
      throw new Error(`bounded strong ASR chunk receipt segment count mismatch: ${index}`);
    }
    const [textArtifact, srtArtifact] = await Promise.all([
      inspectStableFile(`${outputBase}.txt`),
      inspectStableFile(`${outputBase}.srt`),
    ]);
    if (receipt.artifact_hashes?.json_sha256 !== sha256Bytes(outputBytes)
      || receipt.artifact_hashes?.text_sha256 !== textArtifact.sha256
      || receipt.artifact_hashes?.srt_sha256 !== srtArtifact.sha256) {
      throw new Error(`bounded strong ASR chunk artifact hash mismatch: ${index}`);
    }
    segments.push(...parseWhisperJson(parsed, receipt.window, { runId: manifest.run_id }));
    artifactRows.push({
      chunk_index: index,
      output_sha256: sha256Bytes(outputBytes),
      receipt_sha256: sha256Bytes(receiptBytes),
      text_sha256: textArtifact.sha256,
      srt_sha256: srtArtifact.sha256,
    });
  }
  segments.sort((left, right) => left.start_seconds - right.start_seconds || left.end_seconds - right.end_seconds);
  const filtered = suppressRepetitiveSegments(segments, manifest.repetition_filter);
  filtered.kept.forEach((segment, index) => { segment.segment_id = index + 1; });
  const reconstructed = filtered.kept.length > 0
    ? `${filtered.kept.map((segment) => JSON.stringify(segment)).join("\n")}\n`
    : "";
  const transcriptPath = path.resolve(repoRoot, manifest.transcript_jsonl_ref);
  await assertExistingInside(outputDir, transcriptPath, "bounded strong ASR transcript");
  const transcriptBytes = await readStableBytes(transcriptPath);
  if (sha256Bytes(transcriptBytes) !== manifest.transcript_sha256
    || sha256Text(reconstructed) !== manifest.transcript_sha256
    || filtered.kept.length !== manifest.segment_count) {
    throw new Error("bounded strong ASR transcript reconstruction mismatch");
  }
  for (const ref of [manifest.transcript_ref, manifest.suppressed_segment_ref]) {
    const artifactPath = path.resolve(repoRoot, ref);
    await assertExistingInside(outputDir, artifactPath, "bounded strong ASR output");
    await inspectStableFile(artifactPath);
  }
  return {
    verified: true,
    execution_artifact_set_sha256: sha256Text(stableStringify(artifactRows)),
  };
}

async function recheckBoundedInputs(options) {
  const [requestBytes, sessionBytes, fastBytes, source, model] = await Promise.all([
    readStableBytes(options.requestPath),
    readStableBytes(options.sessionManifestPath),
    readStableBytes(options.fastManifestPath),
    inspectStableFile(options.sourceAudioPath),
    options.inspectModel(options.modelPath),
  ]);
  if (sha256Bytes(requestBytes) !== options.requestSha256) throw new Error("bounded strong ASR request changed during execution");
  if (sha256Bytes(sessionBytes) !== options.sessionManifestSha256) throw new Error("canonical session manifest changed during bounded strong ASR execution");
  if (sha256Bytes(fastBytes) !== options.fastManifestSha256) throw new Error("fast analysis manifest changed during bounded strong ASR execution");
  if (source.sha256 !== options.sourceSha256) throw new Error("source audio changed during bounded strong ASR execution");
  if (model.sha1 !== options.modelSha1 || model.sha256 !== STRONG_MODEL_SHA256) {
    throw new Error("strong model changed during bounded strong ASR execution");
  }
  if (options.vadModelPath) {
    const vadModel = await inspectStableFile(options.vadModelPath);
    if (vadModel.sha256 !== options.vadModelSha256) {
      throw new Error("VAD model changed during bounded strong ASR execution");
    }
  }
}

function buildBoundedStrongAsrSafeSummary(manifest, options) {
  return {
    schema_version: "soulforge.voice_bounded_strong_asr_run_summary.v1",
    state: "completed",
    applied: Boolean(options.applied),
    feature_enabled: true,
    resumed_completed: Boolean(options.resumedCompleted),
    revision_id: manifest.revision.revision_id,
    run_id: manifest.run_id,
    approved_window_count: manifest.revision.window_count,
    approved_duration_seconds: roundMillis(manifest.revision.windows.reduce((sum, window) => sum + window.duration_seconds, 0)),
    segment_count: manifest.segment_count,
    output_ref: manifest.output_ref,
    analysis_manifest_ref: `${manifest.output_ref}/analysis_manifest.json`,
    transcript_sha256: manifest.transcript_sha256,
    hpp_continuity_state: options.continuity.receipt.state,
    hpp_continuity_receipt_ref: options.continuity.receipt_ref,
    hpp_continuity_gap_codes: options.continuity.receipt.gap_codes,
    canonical_whole_session_pointer_replaced: false,
    delivery_receipt_replaced: false,
    completion_notification_emitted: false,
    provider_transcript_used_as_authority: false,
    transcript_body_copied_to_output: false,
    project_route_state: "candidate_only",
  };
}

async function assertBoundedOutputSurface(outputDir) {
  if (!existsSync(outputDir)) return;
  const allowed = new Set([
    "analysis_manifest.json",
    "chunks",
    "hpp_continuity_receipt.json",
    "suppressed_segments.jsonl",
    "transcript.jsonl",
    "transcript.txt",
  ]);
  const entries = await fs.readdir(outputDir, { withFileTypes: true });
  if (entries.some((entry) => !allowed.has(entry.name)
    || (entry.name === "chunks" ? !entry.isDirectory() : !entry.isFile()))) {
    throw new Error("bounded strong ASR output contains an unexpected artifact");
  }
}

async function boundedChunkIsComplete(outputBase, approved, runtimeWindow) {
  const paths = [
    `${outputBase}.json`,
    `${outputBase}.complete.json`,
    `${outputBase}.txt`,
    `${outputBase}.srt`,
  ];
  if (paths.some((filePath) => !existsSync(filePath))) return false;
  try {
    const outputBytes = await readStableBytes(paths[0]);
    const receipt = JSON.parse((await readStableBytes(paths[1])).toString("utf8"));
    const parsed = JSON.parse(outputBytes.toString("utf8"));
    const [textArtifact, srtArtifact] = await Promise.all([
      inspectStableFile(paths[2]),
      inspectStableFile(paths[3]),
    ]);
    return receipt.schema_version === "soulforge.local_asr_chunk_receipt.v0"
      && receipt.request_window_id === approved.window_id
      && stableStringify(receipt.window) === stableStringify(runtimeWindow)
      && receipt.segment_count === (Array.isArray(parsed.transcription) ? parsed.transcription.length : 0)
      && receipt.artifact_hashes?.json_sha256 === sha256Bytes(outputBytes)
      && receipt.artifact_hashes?.text_sha256 === textArtifact.sha256
      && receipt.artifact_hashes?.srt_sha256 === srtArtifact.sha256;
  } catch {
    return false;
  }
}

async function removeBoundedChunkArtifacts(outputBase) {
  for (const suffix of [".json", ".complete.json", ".txt", ".srt"]) {
    await fs.rm(`${outputBase}${suffix}`, { force: true });
  }
}

function appendWhisperOptions(args, profile, repoRoot) {
  if (profile.decoding?.no_fallback) args.push("-nf");
  if (profile.decoding?.suppress_non_speech_tokens) args.push("-sns");
  if (profile.decoding?.max_context_tokens != null) args.push("-mc", String(profile.decoding.max_context_tokens));
  if (profile.vad?.enabled) {
    args.push(
      "--vad",
      "-vm", path.resolve(repoRoot, profile.vad.model_path),
      "-vt", String(profile.vad.threshold ?? 0.5),
      "-vspd", String(profile.vad.min_speech_duration_ms ?? 250),
      "-vsd", String(profile.vad.min_silence_duration_ms ?? 100),
      "-vmsd", String(profile.vad.max_speech_duration_seconds ?? Number.MAX_SAFE_INTEGER),
      "-vp", String(profile.vad.speech_pad_ms ?? 30),
      "-vo", String(profile.vad.samples_overlap_seconds ?? 0.1),
    );
  }
  if (String(profile.terms_prompt ?? "").trim()) args.push("--prompt", String(profile.terms_prompt).trim());
}

function classifyBoundedStrongFailure(error) {
  const message = String(error?.message ?? "");
  if (/request/iu.test(message)) return "bounded_request_invalid_or_changed";
  if (/model/iu.test(message)) return "strong_model_invalid_or_changed";
  if (/source audio/iu.test(message)) return "source_audio_invalid_or_changed";
  if (/session manifest|canonical/iu.test(message)) return "canonical_pointer_guard_failed";
  if (/fast analysis/iu.test(message)) return "fast_manifest_invalid_or_changed";
  if (/ffmpeg/iu.test(message)) return "bounded_audio_extraction_failed";
  if (/whisper\.cpp/iu.test(message)) return "bounded_strong_asr_command_failed";
  return "bounded_strong_asr_retryable_failure";
}

async function inspectLibraryContinuity(repoRoot, libraryRef, expected) {
  const libraryPath = path.resolve(repoRoot, libraryRef);
  if (!existsSync(libraryPath)) return artifactCheck("missing", libraryRef, null);
  try {
    const bytes = await readStableBytes(libraryPath);
    const value = JSON.parse(bytes.toString("utf8"));
    const candidateOnly = value.route_state?.route_status !== "accepted_project_route"
      && value.route_state?.accepted_project_code == null
      && value.route_state?.accepted_by == null
      && value.route_state?.accepted_at == null;
    const valid = value.recording_id === expected.sessionId
      && value.session_id === expected.sessionId
      && value.payload_refs?.session_dir === expected.sessionRef
      && value.payload_refs?.source_audio_ref === expected.sourceRef
      && value.status_summary?.source_sha256 === expected.sourceSha256
      && value.raw_payload_boundary?.library_raw_audio_copy_allowed === false
      && value.raw_payload_boundary?.library_raw_transcript_copy_allowed === false
      && candidateOnly;
    return artifactCheck(valid ? "verified" : "invalid", libraryRef, {
      sha256: sha256Bytes(bytes),
      size: bytes.length,
    });
  } catch {
    return artifactCheck("invalid", libraryRef, null);
  }
}

async function inspectProducerReceiptContinuity(repoRoot, receiptRef, expected) {
  const receiptPath = path.resolve(repoRoot, receiptRef);
  if (!existsSync(receiptPath)) return artifactCheck("missing", receiptRef, null);
  try {
    const bytes = await readStableBytes(receiptPath);
    const receipt = JSON.parse(bytes.toString("utf8"));
    validateDeliveryReceipt(receipt);
    if (receipt.session_id !== expected.sessionId) return artifactCheck("invalid", receiptRef, {
      sha256: sha256Bytes(bytes),
      size: bytes.length,
    });
    const expectedRefs = new Map([
      ["source_audio", expected.sourceRef],
      ["session_manifest", expected.sessionManifestRef],
      ["recording_manifest", expected.libraryRef],
    ]);
    for (const [role, ref] of expectedRefs) {
      const row = receipt.files.find((file) => file.role === role && file.ref === ref);
      if (!row) return artifactCheck("invalid", receiptRef, {
        sha256: sha256Bytes(bytes),
        size: bytes.length,
      });
      const observed = await inspectStableFile(path.resolve(repoRoot, ref));
      if (observed.sha256 !== row.sha256 || observed.size !== row.size_bytes) {
        return artifactCheck("mismatch", receiptRef, {
          sha256: sha256Bytes(bytes),
          size: bytes.length,
        });
      }
    }
    return artifactCheck("verified", receiptRef, {
      sha256: sha256Bytes(bytes),
      size: bytes.length,
    });
  } catch {
    return artifactCheck("invalid", receiptRef, null);
  }
}

function artifactCheck(state, ref, observed) {
  return {
    state,
    ref: ref ?? null,
    sha256: observed?.sha256 ?? null,
    size_bytes: Number.isSafeInteger(observed?.size) ? observed.size : null,
  };
}

function validateHppContinuityReceiptShape(receipt) {
  const errors = [];
  if (!validateVoiceHppContinuityReceiptSchema(receipt)) {
    appendSchemaValidationErrors(errors, validateVoiceHppContinuityReceiptSchema.errors);
  }
  if (receipt?.schema_version !== voiceHppContinuityReceiptSchemaVersion) errors.push("continuity schema_version mismatch");
  if (!/^vhc_[a-f0-9]{24}$/u.test(String(receipt?.coverage_id ?? ""))) errors.push("continuity coverage_id is invalid");
  if (!isStrictUtcTimestamp(receipt?.checked_at)) errors.push("continuity checked_at must be strict UTC");
  if (!SAFE_ID_PATTERN.test(String(receipt?.session_id ?? ""))
    || !SAFE_ID_PATTERN.test(String(receipt?.recording_id ?? ""))
    || !/^vbr_[a-f0-9]{24}$/u.test(String(receipt?.revision_id ?? ""))) {
    errors.push("continuity identity is invalid");
  }
  if (!["complete", "gaps_detected"].includes(receipt?.state)) errors.push("continuity state is invalid");
  if (!Array.isArray(receipt?.gap_codes)
    || receipt.gap_codes.some((code) => !SAFE_ID_PATTERN.test(String(code)))) errors.push("continuity gap_codes are invalid");
  for (const name of ["raw_source", "session_manifest", "library_manifest", "producer_receipt", "bounded_revision"]) {
    const check = receipt?.checks?.[name];
    if (!check || !["verified", "missing", "mismatch", "invalid"].includes(check.state)) errors.push(`continuity ${name} state is invalid`);
    if (check?.ref != null && !isSafeRelativeRef(check.ref)) errors.push(`continuity ${name} ref is invalid`);
    if (check?.sha256 != null && !SHA256_PATTERN.test(String(check.sha256))) errors.push(`continuity ${name} SHA-256 is invalid`);
    if (check?.size_bytes != null && (!Number.isSafeInteger(check.size_bytes) || check.size_bytes < 0)) errors.push(`continuity ${name} size is invalid`);
  }
  const restart = receipt?.checks?.catch_up_restart;
  if (!restart || !["verified", "gap"].includes(restart.state)
    || typeof restart.deterministic_revision_identity_verified !== "boolean"
    || typeof restart.completed_artifact_receipts_verified !== "boolean"
    || typeof restart.canonical_whole_session_pointer_preserved !== "boolean"
    || restart.retry_creates_new_revision !== false) errors.push("continuity catch-up/restart check is invalid");
  if (receipt?.project_route_state !== "candidate_only"
    || receipt?.boundaries?.metadata_only !== true
    || receipt?.boundaries?.transcript_body_copied !== false
    || receipt?.boundaries?.audio_body_copied !== false
    || receipt?.boundaries?.absolute_path_copied !== false
    || receipt?.boundaries?.provider_transcript_authority !== "none"
    || receipt?.boundaries?.accepted_project_route_created !== false
    || receipt?.boundaries?.official_task_mutated !== false) errors.push("continuity boundaries are invalid");
  return errors;
}

function appendSchemaValidationErrors(errors, schemaErrors) {
  for (const error of schemaErrors ?? []) {
    errors.push(`schema ${error.instancePath || "/"} ${error.keyword}`);
  }
}

async function inspectStableFile(filePath) {
  const before = await fs.stat(filePath);
  if (!before.isFile()) throw new Error("artifact must be a regular file");
  const sha1 = crypto.createHash("sha1");
  const sha256 = crypto.createHash("sha256");
  await new Promise((resolve, reject) => {
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => {
      sha1.update(chunk);
      sha256.update(chunk);
    });
    stream.on("error", reject);
    stream.on("end", resolve);
  });
  const after = await fs.stat(filePath);
  if (before.size !== after.size || before.mtimeMs !== after.mtimeMs) throw new Error("artifact changed during hash");
  return {
    size: after.size,
    sha1: sha1.digest("hex"),
    sha256: sha256.digest("hex"),
  };
}

async function readStableBytes(filePath) {
  const before = await fs.stat(filePath);
  if (!before.isFile()) throw new Error("metadata artifact must be a regular file");
  const bytes = await fs.readFile(filePath);
  const after = await fs.stat(filePath);
  if (before.size !== after.size || before.mtimeMs !== after.mtimeMs) throw new Error("metadata artifact changed during read");
  return bytes;
}

async function assertExistingInside(root, target, name) {
  const [realRoot, realTarget] = await Promise.all([fs.realpath(root), fs.realpath(target)]);
  if (!isInside(realRoot, realTarget)) throw new Error(`${name} is outside approved custody`);
}

async function ensureWritableParentInside(root, target, name) {
  const resolvedRoot = path.resolve(root);
  const resolvedTarget = path.resolve(target);
  if (!isInside(resolvedRoot, resolvedTarget)) throw new Error(`${name} is outside approved custody`);
  const realRoot = await fs.realpath(resolvedRoot);
  const parent = path.dirname(resolvedTarget);
  let existingAncestor = parent;
  while (!existsSync(existingAncestor)) {
    const next = path.dirname(existingAncestor);
    if (next === existingAncestor || !isInside(resolvedRoot, next)) {
      throw new Error(`${name} has no approved writable ancestor`);
    }
    existingAncestor = next;
  }
  const realAncestor = await fs.realpath(existingAncestor);
  if (!isInside(realRoot, realAncestor)) throw new Error(`${name} writable ancestor is outside approved custody`);
  await fs.mkdir(parent, { recursive: true });
  const realParent = await fs.realpath(parent);
  if (!isInside(realRoot, realParent)) throw new Error(`${name} writable parent is outside approved custody`);
  try {
    const targetState = await fs.lstat(resolvedTarget);
    if (targetState.isSymbolicLink()) throw new Error(`${name} target must not be a symbolic link`);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

function requireSafeId(value, name) {
  const normalized = String(value ?? "");
  if (!SAFE_ID_PATTERN.test(normalized)) throw new Error(`${name} must be a safe id`);
  return normalized;
}

function requireSha256(value, name) {
  const normalized = String(value ?? "").toLowerCase();
  if (!SHA256_PATTERN.test(normalized)) throw new Error(`${name} must be SHA-256`);
  return normalized;
}

function requireSafeRelativeRef(value, name) {
  const normalized = String(value ?? "").replace(/\\/gu, "/");
  if (!isSafeRelativeRef(normalized)) throw new Error(`${name} must be a safe relative ref`);
  return normalized;
}

function isSafeRelativeRef(value) {
  const normalized = String(value ?? "");
  if (!normalized || normalized.includes("\\") || path.posix.isAbsolute(normalized)) return false;
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/u.test(normalized)) return false;
  return normalized.split("/").every((part) => part && part !== "." && part !== "..");
}

function utcTimestamp(value) {
  const date = typeof value === "function"
    ? new Date(value())
    : value instanceof Date ? value : value == null ? new Date() : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error("a valid UTC clock value is required");
  return date.toISOString();
}

function isStrictUtcTimestamp(value) {
  if (typeof value !== "string" || !value.endsWith("Z")) return false;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value;
}

function sha256Bytes(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function sha256Text(value) {
  return sha256Bytes(Buffer.from(String(value), "utf8"));
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function scanForbiddenMetadataKeys(value, trail, errors) {
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    const next = [...trail, key];
    if (/(?:transcript_body|audio_body|raw_payload|provider_summary|download_url|absolute_path|api[_-]?key|authorization|cookie|credential|password|secret|token)/iu.test(key)) {
      if (!new Set([
        "transcript_body_copied",
        "audio_body_copied",
        "raw_payload_copied",
        "provider_transcript_authority",
        "provider_transcript_used_as_input",
        "provider_transcript_used_as_authority",
        "transcript_body_copied_to_output",
        "absolute_path_copied",
        "suppress_non_speech_tokens",
        "max_context_tokens",
        "token_probability_state",
        "token_probability_count",
        "mean_token_probability",
        "low_probability_token_count",
        "low_probability_token_ratio",
      ]).has(key)) {
        errors.push(`forbidden metadata key: ${next.join(".")}`);
      }
    }
    scanForbiddenMetadataKeys(child, next, errors);
  }
}

async function writeImmutableJson(filePath, value) {
  const content = `${JSON.stringify(value, null, 2)}\n`;
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  if (existsSync(filePath)) {
    const existing = await fs.readFile(filePath, "utf8");
    if (existing !== content) throw new Error("immutable metadata artifact conflict");
    return { applied: false, duplicate: true };
  }
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  await fs.writeFile(tempPath, content, { encoding: "utf8", flag: "wx" });
  try {
    await fs.link(tempPath, filePath);
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
    const existing = await fs.readFile(filePath, "utf8");
    if (existing !== content) throw new Error("immutable metadata artifact conflict");
    return { applied: false, duplicate: true };
  } finally {
    await fs.rm(tempPath, { force: true });
  }
  return { applied: true, duplicate: false };
}

async function writeJsonPreservingTimestamp(filePath, value, timestampKey) {
  let next = value;
  if (existsSync(filePath)) {
    const existing = JSON.parse(await fs.readFile(filePath, "utf8"));
    const withoutTimestamp = (item) => {
      const clone = { ...item };
      delete clone[timestampKey];
      return stableStringify(clone);
    };
    if (withoutTimestamp(existing) === withoutTimestamp(value)) {
      next = { ...value, [timestampKey]: existing[timestampKey] };
    }
    if (stableStringify(existing) === stableStringify(next)) return { applied: false, changed: false };
  }
  await atomicWriteJson(filePath, next);
  return { applied: true, changed: true };
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

async function atomicWriteJsonInside(root, filePath, value) {
  await ensureWritableParentInside(root, filePath, "bounded strong ASR metadata");
  await atomicWriteJson(filePath, value);
}

async function atomicWriteTextInside(root, filePath, value) {
  await ensureWritableParentInside(root, filePath, "bounded strong ASR artifact");
  await atomicWriteText(filePath, value);
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

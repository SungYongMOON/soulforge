import crypto from "node:crypto";
import { createReadStream } from "node:fs";
import {
  lstat,
  link,
  mkdir,
  open,
  opendir,
  readFile,
  realpath,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildLocalAsrPreflight,
  drainLocalAsrQueue,
  enqueueLocalAsrBacklog,
  loadLocalAsrProfile,
} from "./local_asr.mjs";
import { runVoiceSemanticSweep } from "./voice_semantic_sweep.mjs";

export const continuousVoiceLabelWorkerSchemaVersion = "soulforge.voice.continuous_label_worker_result.v1";
export const continuousVoiceLabelHealthSchemaVersion = "soulforge.voice.continuous_label_worker_health.v1";

const SHA256 = /^[a-f0-9]{64}$/u;
const RUNTIME_ROOT = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_RUNTIME_DEPLOYMENT_ROOT = path.resolve(RUNTIME_ROOT, "..", "..");

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function safePositiveInteger(value, fallback, maximum = 1000) {
  const number = value == null ? fallback : Number(value);
  if (!Number.isSafeInteger(number) || number < 1 || number > maximum) {
    fail("voice_label_worker_limit_invalid");
  }
  return number;
}

function normalizedSha256(value, code) {
  const result = String(value ?? "").replace(/^sha256:/u, "").toLowerCase();
  if (!SHA256.test(result)) fail(code);
  return result;
}

function compactTimestamp(date) {
  return date.toISOString().replace(/[-:.]/gu, "").replace("Z", "Z");
}

function pathKey(value) {
  const resolved = path.resolve(value);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function isSameOrInside(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative === "" || (!relative.startsWith(`..${path.sep}`)
    && relative !== ".."
    && !path.isAbsolute(relative));
}

function isStrictlyInside(parent, candidate) {
  return pathKey(parent) !== pathKey(candidate) && isSameOrInside(parent, candidate);
}

function safeRelativeRef(value, code) {
  if (typeof value !== "string"
    || value.length === 0
    || value.includes("\0")
    || path.isAbsolute(value)
    || path.win32.isAbsolute(value)
    || path.posix.isAbsolute(value)
    || /^[A-Za-z]:/u.test(value)) {
    fail(code);
  }
  const parts = value.split(/[\\/]/u);
  if (parts.some((part) => part === "" || part === "." || part === "..")) fail(code);
  return parts.join(path.sep);
}

async function canonicalExisting(value, kind, code) {
  const resolved = path.resolve(value);
  let info;
  try {
    info = await lstat(resolved);
  } catch {
    fail(code);
  }
  if (info.isSymbolicLink()
    || (kind === "directory" && !info.isDirectory())
    || (kind === "file" && !info.isFile())) {
    fail(code);
  }
  const canonical = path.resolve(await realpath(resolved));
  if (pathKey(canonical) !== pathKey(resolved)) fail(code);
  return canonical;
}

async function canonicalPlannedDirectory(value, code) {
  const resolved = path.resolve(value);
  let cursor = resolved;
  const missing = [];
  while (true) {
    try {
      await lstat(cursor);
      const canonicalAncestor = await canonicalExisting(cursor, "directory", code);
      const canonical = path.resolve(canonicalAncestor, ...missing.reverse());
      if (pathKey(canonical) !== pathKey(resolved)) fail(code);
      return canonical;
    } catch (error) {
      if (error?.code === "ENOENT" && cursor !== path.dirname(cursor)) {
        missing.push(path.basename(cursor));
        cursor = path.dirname(cursor);
        continue;
      }
      throw error;
    }
  }
}

async function assertNoReparseDirectories(root, code) {
  let directory;
  try {
    directory = await opendir(root);
  } catch (error) {
    if (error?.code === "ENOENT") return;
    throw error;
  }
  for await (const entry of directory) {
    if (entry.isSymbolicLink()) fail(code);
    if (entry.isDirectory()) {
      await assertNoReparseDirectories(path.join(root, entry.name), code);
    }
  }
}

async function assertSafeStateTree(stateRoot) {
  const canonicalStateRoot = await canonicalExisting(
    stateRoot,
    "directory",
    "voice_label_state_root_unsafe",
  );
  async function visit(directoryPath) {
    const directory = await opendir(directoryPath);
    for await (const entry of directory) {
      const target = path.join(directoryPath, entry.name);
      const info = await lstat(target);
      if (entry.isSymbolicLink() || info.isSymbolicLink()) {
        fail("voice_label_state_descendant_unsafe");
      }
      const canonical = path.resolve(await realpath(target));
      if (!isStrictlyInside(canonicalStateRoot, canonical)
        || pathKey(canonical) !== pathKey(target)
        || (info.isFile() && info.nlink > 1)) {
        fail("voice_label_state_descendant_unsafe");
      }
      if (info.isDirectory()) await visit(target);
    }
  }
  await visit(canonicalStateRoot);
  return canonicalStateRoot;
}

async function canonicalApprovedQueueRoot({ repoRoot, voiceRoot, queueRef }) {
  const approvedQueueRoot = await canonicalPlannedDirectory(
    path.join(voiceRoot, "local_asr_queue"),
    "voice_label_queue_root_unsafe",
  );
  const candidate = path.resolve(repoRoot, queueRef);
  try {
    const strictCandidate = await canonicalPlannedDirectory(
      candidate,
      "voice_label_queue_root_unsafe",
    );
    if (pathKey(strictCandidate) !== pathKey(approvedQueueRoot)) {
      fail("voice_label_queue_root_unsafe");
    }
    return strictCandidate;
  } catch (error) {
    if (error?.code !== "voice_label_queue_root_unsafe") throw error;
  }

  const workspaceRoot = await canonicalExisting(
    path.join(repoRoot, "_workspaces"),
    "directory",
    "voice_label_queue_root_unsafe",
  );
  if (!isStrictlyInside(repoRoot, workspaceRoot)) {
    fail("voice_label_queue_root_unsafe");
  }
  const aliasRoot = path.join(workspaceRoot, "system");
  const expectedAliasQueueRoot = path.join(
    aliasRoot,
    "voice_capture",
    "local_asr_queue",
  );
  if (pathKey(candidate) !== pathKey(expectedAliasQueueRoot)) {
    fail("voice_label_queue_root_unsafe");
  }
  let aliasInfo;
  try {
    aliasInfo = await lstat(aliasRoot);
  } catch {
    fail("voice_label_queue_root_unsafe");
  }
  if (!aliasInfo.isSymbolicLink()) fail("voice_label_queue_root_unsafe");
  const aliasTarget = path.resolve(await realpath(aliasRoot));
  if (pathKey(aliasTarget) !== pathKey(path.dirname(voiceRoot))) {
    fail("voice_label_queue_root_unsafe");
  }
  const resolvedAliasQueueRoot = path.resolve(
    aliasTarget,
    "voice_capture",
    "local_asr_queue",
  );
  if (pathKey(resolvedAliasQueueRoot) !== pathKey(approvedQueueRoot)) {
    fail("voice_label_queue_root_unsafe");
  }
  return approvedQueueRoot;
}

async function validateBaseCustody({
  repoRoot,
  voiceRoot,
  profileRef,
  runtimeRoot,
}) {
  const canonicalRepoRoot = await canonicalExisting(
    repoRoot,
    "directory",
    "voice_label_repo_root_unsafe",
  );
  const canonicalVoiceRoot = await canonicalExisting(
    voiceRoot,
    "directory",
    "voice_label_voice_root_unsafe",
  );
  const canonicalRuntimeRoot = await canonicalExisting(
    runtimeRoot,
    "directory",
    "voice_label_runtime_root_unsafe",
  );
  if (isSameOrInside(canonicalRuntimeRoot, canonicalRepoRoot)
    || isSameOrInside(canonicalRepoRoot, canonicalRuntimeRoot)) {
    fail("voice_label_runtime_repo_overlap");
  }
  if (pathKey(path.join(canonicalRuntimeRoot, "guild_hall", "voice_capture"))
    !== pathKey(RUNTIME_ROOT)) {
    fail("voice_label_runtime_root_unsafe");
  }
  const canonicalProfileRef = await canonicalExisting(
    profileRef,
    "file",
    "voice_label_profile_ref_unsafe",
  );
  const profileConfigRoot = await canonicalExisting(
    path.join(canonicalVoiceRoot, "config"),
    "directory",
    "voice_label_profile_ref_unsafe",
  );
  if (!isSameOrInside(profileConfigRoot, canonicalProfileRef)) {
    fail("voice_label_profile_ref_unsafe");
  }
  return {
    repoRoot: canonicalRepoRoot,
    runtimeRoot: canonicalRuntimeRoot,
    voiceRoot: canonicalVoiceRoot,
    profileRef: canonicalProfileRef,
  };
}

async function validateApplyStateCustody({
  repoRoot,
  runtimeRoot,
  voiceRoot,
  profileRef,
  stateRoot,
  expectedStateRoot,
  expectedAsrBinRoot,
}) {
  if (!expectedStateRoot) fail("voice_label_worker_expected_state_root_required");
  if (!expectedAsrBinRoot) fail("voice_label_worker_expected_asr_bin_root_required");
  const canonicalStateRoot = await canonicalPlannedDirectory(
    stateRoot,
    "voice_label_state_root_unsafe",
  );
  const canonicalExpectedStateRoot = await canonicalExisting(
    expectedStateRoot,
    "directory",
    "voice_label_expected_state_root_unsafe",
  );
  if (!isSameOrInside(canonicalExpectedStateRoot, canonicalStateRoot)) {
    fail("voice_label_state_root_outside_expected");
  }
  const canonicalExpectedAsrBinRoot = await canonicalExisting(
      expectedAsrBinRoot,
      "directory",
      "voice_label_expected_asr_bin_root_unsafe",
    );
  const protectedRoots = [
    repoRoot,
    voiceRoot,
    runtimeRoot,
    path.dirname(profileRef),
    canonicalExpectedAsrBinRoot,
  ];
  if (protectedRoots.some((root) => (
    isSameOrInside(root, canonicalStateRoot)
    || isSameOrInside(canonicalStateRoot, root)
  )) || protectedRoots.some((root) => (
    isSameOrInside(root, canonicalExpectedStateRoot)
    || isSameOrInside(canonicalExpectedStateRoot, root)
  ))) {
    fail("voice_label_state_root_unsafe");
  }
  await mkdir(canonicalStateRoot, { recursive: true });
  const validatedStateRoot = await canonicalExisting(
    canonicalStateRoot,
    "directory",
    "voice_label_state_root_unsafe",
  );
  await assertSafeStateTree(validatedStateRoot);
  return validatedStateRoot;
}

async function validateProfileCustody({
  repoRoot,
  voiceRoot,
  stateRoot,
  expectedAsrBinRoot,
  profile,
  asrBinary,
}) {
  const queueRef = safeRelativeRef(
    profile?.queue_root,
    "voice_label_queue_root_unsafe",
  );
  const outputRef = safeRelativeRef(
    profile?.output_subdir,
    "voice_label_output_subdir_unsafe",
  );
  safeRelativeRef(profile?.run_id, "voice_label_run_id_unsafe");
  const queueRoot = await canonicalApprovedQueueRoot({
    repoRoot,
    voiceRoot,
    queueRef,
  });
  const sessionsRoot = await canonicalPlannedDirectory(
    path.join(voiceRoot, "sessions"),
    "voice_label_sessions_root_unsafe",
  );
  const outputProbe = path.resolve(sessionsRoot, "custody-probe", outputRef);
  const approvedOutputRoot = path.resolve(
    sessionsRoot,
    "custody-probe",
    "analysis",
    "local_asr",
  );
  if (pathKey(queueRoot) !== pathKey(path.join(voiceRoot, "local_asr_queue"))
    || !isSameOrInside(approvedOutputRoot, outputProbe)) {
    fail("voice_label_profile_custody_unsafe");
  }
  await assertNoReparseDirectories(sessionsRoot, "voice_label_sessions_root_unsafe");
  const canonicalAsrBinary = await canonicalExisting(
    asrBinary,
    "file",
    "voice_label_asr_binary_unsafe",
  );
  if (expectedAsrBinRoot) {
    const canonicalExpectedAsrBinRoot = await canonicalExisting(
      expectedAsrBinRoot,
      "directory",
      "voice_label_expected_asr_bin_root_unsafe",
    );
    if (!isSameOrInside(canonicalExpectedAsrBinRoot, canonicalAsrBinary)) {
      fail("voice_label_asr_binary_unsafe");
    }
  }
  if (stateRoot && (
    isSameOrInside(path.dirname(canonicalAsrBinary), stateRoot)
    || isSameOrInside(stateRoot, path.dirname(canonicalAsrBinary))
  )) {
    fail("voice_label_state_root_unsafe");
  }
  return { canonicalAsrBinary };
}

function processIsRunning(pid) {
  if (!Number.isSafeInteger(pid) || pid < 1) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function hashFile(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

async function atomicWriteJson(stateRoot, filePath, value) {
  if (!isStrictlyInside(stateRoot, filePath)) fail("voice_label_state_descendant_unsafe");
  await assertSafeStateTree(stateRoot);
  await mkdir(path.dirname(filePath), { recursive: true });
  await assertSafeStateTree(stateRoot);
  const temporaryPath = `${filePath}.tmp-${process.pid}-${crypto.randomUUID()}`;
  if (!isStrictlyInside(stateRoot, temporaryPath)) fail("voice_label_state_descendant_unsafe");
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
  });
  await assertSafeStateTree(stateRoot);
  await rename(temporaryPath, filePath);
}

async function acquireWorkerLock(stateRoot, now, staleAfterSeconds = 60) {
  const lockPath = path.join(stateRoot, "worker.lock");
  const token = crypto.randomUUID();
  const temporaryPath = `${lockPath}.candidate-${process.pid}-${token}`;
  const payload = {
    schema_version: "soulforge.voice.continuous_label_worker_lock.v1",
    token,
    pid: process.pid,
    started_at: now.toISOString(),
  };
  if (!isStrictlyInside(stateRoot, lockPath)
    || !isStrictlyInside(stateRoot, temporaryPath)) {
    fail("voice_label_state_descendant_unsafe");
  }
  await assertSafeStateTree(stateRoot);

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const handle = await open(temporaryPath, "wx");
      try {
        await handle.writeFile(`${JSON.stringify(payload)}\n`, "utf8");
      } finally {
        await handle.close();
      }
      await link(temporaryPath, lockPath);
      await rm(temporaryPath, { force: true });
      return { acquired: true, lockPath, token };
    } catch (error) {
      await rm(temporaryPath, { force: true });
      if (error?.code !== "EEXIST") throw error;
      await assertSafeStateTree(stateRoot);
      let existing = null;
      let existingAgeSeconds;
      try {
        const info = await stat(lockPath);
        existingAgeSeconds = Math.max(0, (now.getTime() - info.mtimeMs) / 1000);
        const bytes = await readFile(lockPath, "utf8");
        existing = JSON.parse(bytes);
      } catch (readError) {
        if (readError?.code === "ENOENT") continue;
        if (existingAgeSeconds == null || existingAgeSeconds < staleAfterSeconds) {
          return { acquired: false, lockPath };
        }
      }
      if (existingAgeSeconds < staleAfterSeconds || processIsRunning(Number(existing?.pid))) {
        return { acquired: false, lockPath };
      }
      const stalePath = `${lockPath}.stale-${compactTimestamp(now)}-${crypto.randomUUID()}`;
      if (!isStrictlyInside(stateRoot, stalePath)) fail("voice_label_state_descendant_unsafe");
      try {
        await rename(lockPath, stalePath);
      } catch (renameError) {
        if (renameError?.code !== "ENOENT") return { acquired: false, lockPath };
      }
    }
  }
  return { acquired: false, lockPath };
}

async function releaseWorkerLock(lock) {
  if (!lock?.acquired) return;
  try {
    await assertSafeStateTree(path.dirname(lock.lockPath));
    const current = JSON.parse(await readFile(lock.lockPath, "utf8"));
    if (current?.token === lock.token) await rm(lock.lockPath, { force: true });
  } catch {
    // A missing or replaced lock is not owned by this process.
  }
}

function baseResult({ now, apply, runId, profileSha256 }) {
  return {
    schema_version: continuousVoiceLabelWorkerSchemaVersion,
    run_id: runId,
    mode: apply ? "apply" : "dry_run",
    status: "unknown",
    started_at: now.toISOString(),
    completed_at: null,
    profile_sha256: profileSha256,
    raw_payload_copied: false,
    official_task_mutation_count: 0,
    official_project_assignment_mutation_count: 0,
  };
}

function summarizeEnqueue(result) {
  return {
    pending_count: Number(result?.pending_count ?? 0),
    queued_count: Number(result?.queued_count ?? 0),
  };
}

function summarizeDrain(result) {
  return {
    pending_count: Number(result?.pending_count ?? 0),
    processed_count: Number(result?.processed_count ?? 0),
    failed_count: Number(result?.failed_count ?? 0),
    remaining_pending_count: Number(result?.remaining_pending_count ?? 0),
    retry_required: Boolean(result?.retry_required),
  };
}

function summarizeLabels(result) {
  return {
    eligible_session_count: Number(result?.eligible_session_count ?? 0),
    pending_session_count: Number(result?.pending_session_count ?? 0),
    processed_session_count: Number(result?.processed_session_count ?? 0),
    duplicate_session_count: Number(result?.duplicate_session_count ?? 0),
    failed_session_count: Number(result?.failed_session_count ?? 0),
    timeline_annotation_count: Number(result?.timeline_annotation_count ?? 0),
  };
}

async function writeResultState(stateRoot, result) {
  const receiptPath = path.join(stateRoot, "receipts", `${result.run_id}.json`);
  const healthPath = path.join(stateRoot, "health.json");
  await assertSafeStateTree(stateRoot);
  await atomicWriteJson(stateRoot, receiptPath, result);
  await atomicWriteJson(stateRoot, healthPath, {
    schema_version: continuousVoiceLabelHealthSchemaVersion,
    status: result.status,
    last_run_id: result.run_id,
    last_completed_at: result.completed_at,
    asr: result.asr,
    labels: result.labels,
    error_code: result.error_code ?? null,
  });
  return { receiptPath, healthPath };
}

export async function runContinuousVoiceLabelWorker(options = {}) {
  const now = options.now instanceof Date ? options.now : new Date();
  const apply = options.apply === true;
  if (!options.voiceRoot || !options.profileRef) fail("voice_label_worker_binding_required");
  if (apply && !options.stateRoot) fail("voice_label_worker_state_root_required");
  const baseCustody = await validateBaseCustody({
    repoRoot: options.repoRoot ?? process.cwd(),
    voiceRoot: options.voiceRoot,
    profileRef: options.profileRef,
    runtimeRoot: options.expectedRuntimeRoot
      ?? process.env.SOULFORGE_VOICE_LABEL_EXPECTED_RUNTIME_ROOT
      ?? DEFAULT_RUNTIME_DEPLOYMENT_ROOT,
  });
  const repoRoot = baseCustody.repoRoot;
  const runtimeRoot = baseCustody.runtimeRoot;
  const voiceRoot = baseCustody.voiceRoot;
  const profileRef = baseCustody.profileRef;
  const expectedAsrBinRoot = options.expectedAsrBinRoot
    ?? process.env.SOULFORGE_VOICE_LABEL_EXPECTED_ASR_BIN_ROOT;
  const stateRoot = apply
    ? await validateApplyStateCustody({
      repoRoot,
      runtimeRoot,
      voiceRoot,
      profileRef,
      stateRoot: options.stateRoot,
      expectedStateRoot: options.expectedStateRoot
        ?? process.env.SOULFORGE_VOICE_LABEL_EXPECTED_STATE_ROOT,
      expectedAsrBinRoot,
    })
    : null;
  const runId = `voice-label-${compactTimestamp(now)}-${crypto.randomUUID().slice(0, 8)}`;
  let result = baseResult({
    now,
    apply,
    runId,
    profileSha256: null,
  });
  let lock = null;
  try {
    lock = apply ? await acquireWorkerLock(stateRoot, now) : null;
    if (apply && !lock.acquired) {
      return {
        ...result,
        status: "already_running",
        completed_at: new Date().toISOString(),
        asr: { pending_count: 0, processed_count: 0, failed_count: 0, remaining_pending_count: 0, retry_required: false },
        labels: { eligible_session_count: 0, pending_session_count: 0, processed_session_count: 0, duplicate_session_count: 0, failed_session_count: 0, timeline_annotation_count: 0 },
      };
    }
    const expectedProfileSha256 = normalizedSha256(
      options.expectedProfileSha256,
      "voice_label_profile_digest_invalid",
    );
    const expectedAsrSha256 = normalizedSha256(
      options.expectedAsrSha256,
      "voice_label_asr_digest_invalid",
    );
    const observedProfileSha256 = await (options.hashFileImpl ?? hashFile)(profileRef);
    result = { ...result, profile_sha256: observedProfileSha256 };
    if (observedProfileSha256 !== expectedProfileSha256) {
      fail("voice_label_profile_digest_mismatch");
    }
    const maxAsrSessions = safePositiveInteger(options.maxAsrSessions, 1, 16);
    const maxLabelSessions = safePositiveInteger(options.maxLabelSessions, 5, 1000);
    const preflight = await (options.preflightImpl ?? buildLocalAsrPreflight)({
      repoRoot,
      profileRef,
    });
    const asrCheck = preflight?.checks?.find((check) => check.id.endsWith("_available")
      && typeof check.resolved_path === "string"
      && /whisper-cli(?:\.exe)?$/iu.test(check.resolved_path));
    const profileLoad = preflight?.ok
      ? await (options.loadProfileImpl ?? loadLocalAsrProfile)({ repoRoot, profileRef })
      : null;
    const custody = asrCheck?.resolved_path && profileLoad
      ? await validateProfileCustody({
        repoRoot,
        voiceRoot,
        stateRoot,
        expectedAsrBinRoot,
        profile: profileLoad.profile,
        asrBinary: asrCheck.resolved_path,
      })
      : null;
    const observedAsrSha256 = custody
      ? await (options.hashFileImpl ?? hashFile)(custody.canonicalAsrBinary)
      : null;
    if (!preflight?.ok || observedAsrSha256 !== expectedAsrSha256) {
      const blocked = {
        ...result,
        status: "blocked",
        completed_at: new Date().toISOString(),
        preflight_ok: Boolean(preflight?.ok),
        asr_binary_sha256_match: observedAsrSha256 === expectedAsrSha256,
        asr: { pending_count: 0, processed_count: 0, failed_count: 0, remaining_pending_count: 0, retry_required: false },
        labels: { eligible_session_count: 0, pending_session_count: 0, processed_session_count: 0, duplicate_session_count: 0, failed_session_count: 0, timeline_annotation_count: 0 },
      };
      if (apply) await writeResultState(stateRoot, blocked);
      return blocked;
    }

    const profile = {
      ...profileLoad.profile,
      asr_binary: custody.canonicalAsrBinary,
    };
    const enqueue = await (options.enqueueImpl ?? enqueueLocalAsrBacklog)({
      repoRoot,
      profile,
      profileRef,
      apply,
      now,
    });
    const drain = await (options.drainImpl ?? drainLocalAsrQueue)({
      repoRoot,
      profile,
      profileRef,
      apply,
      maxSessions: maxAsrSessions,
      now,
    });
    const labels = await (options.sweepImpl ?? runVoiceSemanticSweep)({
      repo_root: repoRoot,
      voice_root: voiceRoot,
      apply,
      max_sessions: maxLabelSessions,
    });
    const drainSummary = summarizeDrain(drain);
    const labelSummary = summarizeLabels(labels);
    const completed = {
      ...result,
      status: drainSummary.failed_count > 0 || labelSummary.failed_session_count > 0
        ? "degraded"
        : "ok",
      completed_at: new Date().toISOString(),
      preflight_ok: true,
      asr_binary_sha256_match: true,
      queue: summarizeEnqueue(enqueue),
      asr: drainSummary,
      labels: labelSummary,
    };
    if (apply) await writeResultState(stateRoot, completed);
    return completed;
  } catch (error) {
    if (apply) {
      const failed = {
        ...result,
        status: "failed",
        completed_at: new Date().toISOString(),
        error_code: /^[a-z0-9_]{1,128}$/u.test(String(error?.code ?? ""))
          ? error.code
          : "voice_label_worker_failed",
        asr: { pending_count: 0, processed_count: 0, failed_count: 1, remaining_pending_count: 0, retry_required: true },
        labels: { eligible_session_count: 0, pending_session_count: 0, processed_session_count: 0, duplicate_session_count: 0, failed_session_count: 0, timeline_annotation_count: 0 },
      };
      await writeResultState(stateRoot, failed);
    }
    throw error;
  } finally {
    await releaseWorkerLock(lock);
  }
}

import { createHash } from "node:crypto";
import {
  lstat,
  opendir,
  readFile,
  realpath,
} from "node:fs/promises";
import path from "node:path";

import {
  analyzeVoiceSemanticManifest,
  semanticLabelEngineVersion,
} from "./semantic_labeling.mjs";

const MAX_DISCOVERED_MANIFESTS = 5000;

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

async function normalDirectory(root) {
  const absolute = path.resolve(root);
  const info = await lstat(absolute);
  if (!info.isDirectory() || info.isSymbolicLink()) fail("voice_semantic_root_unsafe");
  if (path.resolve(await realpath(absolute)) !== absolute) fail("voice_semantic_root_unsafe");
  return absolute;
}

async function collectAnalysisManifests(root) {
  const manifests = [];
  const stack = [path.join(root, "sessions")];
  while (stack.length > 0) {
    const current = stack.pop();
    let directory;
    try {
      directory = await opendir(current);
    } catch (error) {
      if (error?.code === "ENOENT") continue;
      throw error;
    }
    for await (const entry of directory) {
      const target = path.join(current, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        if (entry.name !== "semantic_labels") stack.push(target);
      } else if (entry.isFile() && entry.name === "analysis_manifest.json") {
        manifests.push(target);
        if (manifests.length > MAX_DISCOVERED_MANIFESTS) {
          fail("voice_semantic_discovery_limit_exceeded");
        }
      }
    }
  }
  return manifests.sort();
}

function sessionDirForManifest(manifestPath, root) {
  const relative = path.relative(path.join(root, "sessions"), manifestPath);
  const parts = relative.split(path.sep);
  if (parts.length < 4 || parts[0] === "..") fail("voice_semantic_manifest_outside_sessions");
  return path.join(root, "sessions", parts[0], parts[1]);
}

function manifestRank(manifest) {
  const model = String(manifest.model_id ?? manifest.run_id ?? "").toLocaleLowerCase("en");
  if (model.includes("large-v3") && !model.includes("turbo")) return 3;
  if (model.includes("large-v3-turbo")) return 2;
  return 1;
}

async function readManifestCandidate(manifestPath, root) {
  const bytes = await readFile(manifestPath);
  const sessionDir = sessionDirForManifest(manifestPath, root);
  let manifest;
  try {
    manifest = JSON.parse(bytes.toString("utf8"));
  } catch {
    return {
      invalid: true,
      manifestPath,
      sessionDir,
      errorCode: "voice_semantic_manifest_invalid",
    };
  }
  return {
    invalid: false,
    manifestPath,
    sessionDir,
    sessionId: String(manifest.session_id ?? ""),
    state: manifest.state,
    rank: manifestRank(manifest),
    completedAt: String(manifest.completed_at ?? ""),
    transcriptSha256: String(manifest.transcript_sha256 ?? ""),
    manifestSha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

function chooseOnePerSession(candidates) {
  const bySession = new Map();
  for (const candidate of candidates) {
    if (candidate.invalid || candidate.state !== "completed" || !candidate.sessionId) continue;
    const retained = bySession.get(candidate.sessionDir);
    if (!retained
      || candidate.rank > retained.rank
      || (candidate.rank === retained.rank && candidate.completedAt > retained.completedAt)) {
      bySession.set(candidate.sessionDir, candidate);
    }
  }
  return [...bySession.values()].sort(
    (left, right) => left.completedAt.localeCompare(right.completedAt)
      || left.sessionId.localeCompare(right.sessionId),
  );
}

async function hasCurrentSemanticGeneration(candidate) {
  const semanticRoot = path.join(candidate.sessionDir, "analysis", "semantic_labels");
  let directory;
  try {
    directory = await opendir(semanticRoot);
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
  for await (const entry of directory) {
    if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
    const runPath = path.join(semanticRoot, entry.name, "semantic_label_run.json");
    const timelinePath = path.join(semanticRoot, entry.name, "source_timeline_annotations.jsonl");
    try {
      const [runBytes, timelineInfo] = await Promise.all([
        readFile(runPath),
        lstat(timelinePath),
      ]);
      const run = JSON.parse(runBytes.toString("utf8"));
      if (timelineInfo.isFile()
        && !timelineInfo.isSymbolicLink()
        && run?.schema_version === "soulforge.voice_semantic_label_run.v1"
        && run?.engine?.engine_version === semanticLabelEngineVersion
        && run?.recording_ref?.transcript_sha256 === candidate.transcriptSha256) {
        return true;
      }
    } catch (error) {
      if (!["ENOENT", "ENOTDIR", "SyntaxError"].includes(error?.code)
        && !(error instanceof SyntaxError)) throw error;
    }
  }
  return false;
}

export async function runVoiceSemanticSweep({
  repo_root: repoRoot,
  voice_root: voiceRoot,
  apply = false,
  max_sessions: maxSessions = 20,
}) {
  if (!Number.isSafeInteger(maxSessions) || maxSessions < 1 || maxSessions > 1000) {
    fail("voice_semantic_max_sessions_invalid");
  }
  const canonicalRoot = await normalDirectory(voiceRoot);
  const manifestPaths = await collectAnalysisManifests(canonicalRoot);
  const discoveredCandidates = await Promise.all(
    manifestPaths.map((manifestPath) => readManifestCandidate(manifestPath, canonicalRoot)),
  );
  const invalidCandidates = discoveredCandidates.filter((candidate) => candidate.invalid);
  const candidates = chooseOnePerSession(discoveredCandidates);
  const completionRows = await Promise.all(candidates.map(async (candidate) => ({
    candidate,
    processed: await hasCurrentSemanticGeneration(candidate),
  })));
  const pending = completionRows.filter((row) => !row.processed).map((row) => row.candidate);
  const processed = completionRows.filter((row) => row.processed).map((row) => row.candidate);
  const selected = [...pending, ...processed];
  const summary = {
    mode: apply ? "apply" : "dry_run",
    discovered_manifest_count: manifestPaths.length,
    eligible_session_count: candidates.length,
    pending_session_count: pending.length,
    selected_session_count: 0,
    processed_session_count: 0,
    duplicate_session_count: 0,
    failed_session_count: invalidCandidates.length,
    timeline_annotation_count: 0,
    official_task_mutation_count: 0,
    official_project_assignment_mutation_count: 0,
    failures: invalidCandidates.map((candidate) => ({
      session_ref: `voice-session:${createHash("sha256").update(candidate.sessionDir).digest("hex").slice(0, 24)}`,
      error_code: candidate.errorCode,
    })),
  };
  for (const candidate of selected) {
    if (summary.processed_session_count >= maxSessions) break;
    summary.selected_session_count += 1;
    try {
      const result = await analyzeVoiceSemanticManifest({
        repoRoot: path.resolve(repoRoot),
        voiceRoot: canonicalRoot,
        analysisManifestPath: candidate.manifestPath,
        apply,
      });
      summary.processed_session_count += 1;
      summary.timeline_annotation_count += result.timeline_annotation_count ?? 0;
      if (result.duplicate === true) summary.duplicate_session_count += 1;
    } catch (error) {
      summary.failed_session_count += 1;
      summary.failures.push({
        session_ref: `voice-session:${createHash("sha256").update(candidate.sessionDir).digest("hex").slice(0, 24)}`,
        error_code: /^[A-Za-z0-9_.-]{1,80}$/u.test(String(error?.code ?? ""))
          ? error.code
          : "voice_semantic_processing_failed",
      });
    }
  }
  return summary;
}

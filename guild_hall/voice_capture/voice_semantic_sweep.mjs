import { createHash, randomUUID } from "node:crypto";
import {
  link,
  lstat,
  mkdir,
  opendir,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

import {
  analyzeVoiceSemanticManifest,
  semanticLabelEngineVersion,
} from "./semantic_labeling.mjs";

const MAX_DISCOVERED_MANIFESTS = 5000;
const NO_SEMANTIC_CONTENT_CODE = "voice_semantic_no_content";
const NO_SEMANTIC_CONTENT_SCHEMA = "soulforge.voice_semantic_no_content.v1";
const SAFE_FAILURE_CODE = /^[a-z0-9_]{1,128}$/u;

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
    segmentCount: Number(manifest.segment_count),
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

function noContentMarker(candidate) {
  return {
    schema_version: NO_SEMANTIC_CONTENT_SCHEMA,
    manifest_sha256: candidate.manifestSha256,
    transcript_sha256: candidate.transcriptSha256,
    segment_count: 0,
    engine_version: semanticLabelEngineVersion,
  };
}

function noContentMarkerPaths(candidate) {
  const root = path.join(candidate.sessionDir, "analysis", "semantic_labels", "no_content");
  return {
    root,
    target: path.join(root, `marker-${candidate.manifestSha256.slice(0, 16)}.json`),
  };
}

function sameNoContentMarker(actual, expected) {
  if (!actual || typeof actual !== "object" || Array.isArray(actual)) return false;
  const keys = Object.keys(actual).sort();
  const expectedKeys = Object.keys(expected).sort();
  return keys.length === expectedKeys.length
    && keys.every((key, index) => key === expectedKeys[index])
    && expectedKeys.every((key) => actual[key] === expected[key]);
}

async function hasCurrentNoContentMarker(candidate) {
  const { target } = noContentMarkerPaths(candidate);
  let info;
  try {
    info = await lstat(target);
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
  if (!info.isFile() || info.isSymbolicLink()) fail("voice_semantic_no_content_marker_unsafe");
  let actual;
  try {
    actual = JSON.parse((await readFile(target)).toString("utf8"));
  } catch {
    fail("voice_semantic_no_content_marker_invalid");
  }
  if (!sameNoContentMarker(actual, noContentMarker(candidate))) {
    fail("voice_semantic_no_content_marker_invalid");
  }
  return true;
}

async function ensurePlainDirectory(target) {
  try {
    const info = await lstat(target);
    if (!info.isDirectory() || info.isSymbolicLink()) fail("voice_semantic_no_content_root_unsafe");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    await mkdir(target);
    const info = await lstat(target);
    if (!info.isDirectory() || info.isSymbolicLink()) fail("voice_semantic_no_content_root_unsafe");
  }
}

async function writeNoContentMarker(candidate) {
  if (candidate.segmentCount !== 0) fail("voice_semantic_no_content_marker_invalid");
  const semanticRoot = path.join(candidate.sessionDir, "analysis", "semantic_labels");
  const { root, target } = noContentMarkerPaths(candidate);
  await ensurePlainDirectory(semanticRoot);
  await ensurePlainDirectory(root);
  const content = `${JSON.stringify(noContentMarker(candidate), null, 2)}\n`;
  const temporary = path.join(root, `.partial-${randomUUID()}`);
  try {
    await writeFile(temporary, content, { encoding: "utf8", flag: "wx" });
    try {
      await link(temporary, target);
      return true;
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      if (!(await hasCurrentNoContentMarker(candidate))) {
        fail("voice_semantic_no_content_marker_invalid");
      }
      return false;
    }
  } finally {
    await rm(temporary, { force: true });
  }
}

async function currentSemanticGenerationState(candidate) {
  if (await hasCurrentNoContentMarker(candidate)) return "no_content";
  const semanticRoot = path.join(candidate.sessionDir, "analysis", "semantic_labels");
  let directory;
  try {
    directory = await opendir(semanticRoot);
  } catch (error) {
    if (error?.code === "ENOENT") return "pending";
    throw error;
  }
  for await (const entry of directory) {
    if (!entry.isDirectory() || entry.isSymbolicLink() || entry.name === "no_content") continue;
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
        return "processed";
      }
    } catch (error) {
      if (!["ENOENT", "ENOTDIR", "SyntaxError"].includes(error?.code)
        && !(error instanceof SyntaxError)) throw error;
    }
  }
  return "pending";
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
    state: await currentSemanticGenerationState(candidate),
  })));
  const pending = completionRows.filter((row) => row.state === "pending").map((row) => row.candidate);
  const processed = completionRows.filter((row) => row.state === "processed").map((row) => row.candidate);
  const noContent = completionRows.filter((row) => row.state === "no_content").map((row) => row.candidate);
  const selected = [...pending, ...processed];
  const summary = {
    mode: apply ? "apply" : "dry_run",
    discovered_manifest_count: manifestPaths.length,
    eligible_session_count: candidates.length,
    pending_session_count: pending.length,
    selected_session_count: 0,
    processed_session_count: 0,
    duplicate_session_count: 0,
    no_content_session_count: noContent.length,
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
      if (error?.code === NO_SEMANTIC_CONTENT_CODE) {
        if (apply) await writeNoContentMarker(candidate);
        summary.no_content_session_count += 1;
        continue;
      }
      summary.failed_session_count += 1;
      summary.failures.push({
        session_ref: `voice-session:${createHash("sha256").update(candidate.sessionDir).digest("hex").slice(0, 24)}`,
        error_code: SAFE_FAILURE_CODE.test(String(error?.code ?? ""))
          ? error.code
          : "voice_semantic_processing_failed",
      });
    }
  }
  return summary;
}

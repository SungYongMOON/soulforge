import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { access, readFile, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { loadStrictMonthlyRecords, persistStrictMonthlyRecord } from "./evidence_ledger.mjs";

export const INSTRUCTION_MANIFEST_SCHEMA = "soulforge.ai_instruction_manifest.v1";

const execFileAsync = promisify(execFile);
const DIGEST = /^sha256:[a-f0-9]{64}$/u;
const UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const SOURCE_SCOPES = new Set(["global", "root", "nested"]);
const ACCESS_STATES = new Set(["inspected_public", "prohibited", "unavailable"]);
const VISIBILITY_STATES = new Set(["included", "excluded", "unknown"]);
const PROBE_STATES = new Set(["completed", "completed_with_unverified_sources", "failed"]);
const SAFE_CONFIG_VALUE = /^[A-Za-z0-9_.-]{1,120}$/u;
const MAX_INSTRUCTION_SOURCES = 64;

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
  }
  return value;
}

function canonicalJson(value) {
  return JSON.stringify(stableValue(value));
}

function sha256(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function exactKeys(value, keys, code) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(code);
  const actual = Object.keys(value).sort().join("\0");
  const expected = [...keys].sort().join("\0");
  if (actual !== expected) fail(code);
}

function pathWithin(candidate, root) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function findRepoRoot(start) {
  let current = path.resolve(start);
  while (true) {
    if (await exists(path.join(current, ".git"))) return current;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

async function preferredInstructionPath(directory) {
  const override = path.join(directory, "AGENTS.override.md");
  return await exists(override) ? override : path.join(directory, "AGENTS.md");
}

export async function discoverInstructionSources({
  cwd,
  repoRoot = null,
  codexHome = process.env.CODEX_HOME || path.join(os.homedir(), ".codex"),
} = {}) {
  const resolvedCwd = path.resolve(cwd || process.cwd());
  const resolvedRepo = repoRoot ? path.resolve(repoRoot) : await findRepoRoot(resolvedCwd);
  const candidates = [{ scope: "global", path: await preferredInstructionPath(path.resolve(codexHome)) }];
  if (resolvedRepo) {
    candidates.push({ scope: "root", path: await preferredInstructionPath(resolvedRepo) });
    const relative = path.relative(resolvedRepo, resolvedCwd);
    let current = resolvedRepo;
    for (const segment of relative.split(path.sep).filter(Boolean)) {
      current = path.join(current, segment);
      candidates.push({ scope: "nested", path: await preferredInstructionPath(current) });
    }
  }
  return { cwd: resolvedCwd, repoRoot: resolvedRepo, candidates };
}

function sourceAlias(candidate, repoRoot) {
  if (candidate.scope === "global") return `global:${path.basename(candidate.path)}`;
  if (candidate.scope === "root") return `root:${path.basename(candidate.path)}`;
  const relative = repoRoot ? path.relative(repoRoot, candidate.path).replaceAll("\\", "/") : "AGENTS.md";
  return `nested:${relative}`;
}

function collectStrings(value, output = []) {
  if (typeof value === "string") output.push(value);
  else if (Array.isArray(value)) value.forEach((item) => collectStrings(item, output));
  else if (value && typeof value === "object") Object.values(value).forEach((item) => collectStrings(item, output));
  return output;
}

function findTruncation(value) {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findTruncation(item);
      if (found !== null) return found;
    }
  } else if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      if (key === "truncated" && typeof item === "boolean") return item;
      const found = findTruncation(item);
      if (found !== null) return found;
    }
  }
  return null;
}

async function runCodex(args, cwd) {
  const command = process.platform === "win32" ? "cmd.exe" : "codex";
  const commandArgs = process.platform === "win32"
    ? ["/d", "/s", "/c", `codex.cmd ${args.join(" ")}`]
    : args;
  try {
    const result = await execFileAsync(command, commandArgs, {
      cwd,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      windowsHide: true,
    });
    return { status: 0, stdout: result.stdout || "" };
  } catch (error) {
    return { status: Number.isInteger(error?.code) ? error.code : 1, stdout: error?.stdout || "" };
  }
}

export async function runCodexPromptInput({
  cwd,
  modelId = null,
  reasoningEffort = null,
  disabledFeatures = [],
} = {}) {
  const resolvedCwd = path.resolve(cwd || process.cwd());
  for (const item of [modelId, reasoningEffort, ...disabledFeatures]) {
    if (item !== null && (typeof item !== "string" || !SAFE_CONFIG_VALUE.test(item))) fail("instruction_probe_option_invalid");
  }
  const version = await runCodex(["--version"], resolvedCwd);
  const args = ["debug", "prompt-input"];
  if (modelId) args.push("-c", `model=${JSON.stringify(modelId)}`);
  if (reasoningEffort) args.push("-c", `model_reasoning_effort=${JSON.stringify(reasoningEffort)}`);
  for (const feature of disabledFeatures) args.push("--disable", feature);
  const prompt = await runCodex(args, resolvedCwd);
  return {
    status: prompt.status,
    stdout: prompt.stdout,
    codexVersion: version.status === 0 ? version.stdout.trim().slice(0, 120) : null,
  };
}

export async function buildInstructionManifest({
  cwd = process.cwd(),
  repoRoot = null,
  sourceCandidates = null,
  approvedPublicRoots = [],
  runner = runCodexPromptInput,
  observedAt = new Date().toISOString(),
  codexVersion = null,
} = {}) {
  const discovered = sourceCandidates
    ? { cwd: path.resolve(cwd), repoRoot: repoRoot ? path.resolve(repoRoot) : null, candidates: sourceCandidates }
    : await discoverInstructionSources({ cwd, repoRoot });
  if (!Array.isArray(discovered.candidates) || discovered.candidates.length > MAX_INSTRUCTION_SOURCES) fail("instruction_source_count_invalid");
  const approvedRoots = approvedPublicRoots.map((item) => path.resolve(item));
  const sources = [];
  const publicContents = new Map();
  for (const candidate of discovered.candidates) {
    if (!SOURCE_SCOPES.has(candidate.scope)) fail("instruction_source_scope_invalid");
    const resolved = path.resolve(candidate.path);
    const sourceRef = sourceAlias({ ...candidate, path: resolved }, discovered.repoRoot);
    let info;
    try {
      info = await stat(resolved);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      sources.push({ source_ref: sourceRef, scope: candidate.scope, access_status: "unavailable", sha256: null, bytes: null, model_visible: "unknown" });
      continue;
    }
    if (!info.isFile() || !approvedRoots.some((root) => pathWithin(resolved, root))) {
      sources.push({ source_ref: sourceRef, scope: candidate.scope, access_status: "prohibited", sha256: null, bytes: null, model_visible: "unknown" });
      continue;
    }
    const content = await readFile(resolved);
    publicContents.set(sourceRef, content.toString("utf8"));
    sources.push({
      source_ref: sourceRef,
      scope: candidate.scope,
      access_status: "inspected_public",
      sha256: sha256(content),
      bytes: content.byteLength,
      model_visible: "unknown",
    });
  }
  const chainDigest = sha256(canonicalJson(sources.map(({ model_visible: _ignored, ...source }) => source)));
  const hasUnverifiedSources = sources.some((source) => source.access_status === "prohibited");
  let probeStatus = "failed";
  let promptDigest = null;
  let promptBytes = null;
  let truncated = null;
  const result = await runner({ cwd: discovered.cwd });
  codexVersion = result?.codexVersion ?? codexVersion;
  if (result?.status === 0 && typeof result.stdout === "string") {
    try {
      const parsed = JSON.parse(result.stdout);
      const canonicalPrompt = canonicalJson(parsed);
      const visibleStrings = collectStrings(parsed).map((item) => item.replaceAll("\r\n", "\n"));
      for (const source of sources) {
        if (source.access_status !== "inspected_public") continue;
        const expected = publicContents.get(source.source_ref).replaceAll("\r\n", "\n");
        source.model_visible = visibleStrings.some((item) => item.includes(expected)) ? "included" : "excluded";
      }
      promptDigest = sha256(canonicalPrompt);
      promptBytes = Buffer.byteLength(canonicalPrompt);
      truncated = typeof result.truncated === "boolean" ? result.truncated : findTruncation(parsed);
      probeStatus = hasUnverifiedSources ? "completed_with_unverified_sources" : "completed";
    } catch {
      probeStatus = "failed";
    }
  }
  const manifest = {
    schema_version: INSTRUCTION_MANIFEST_SCHEMA,
    manifest_id: `aim_${sha256(`${chainDigest}:${promptDigest ?? "none"}`).slice("sha256:".length)}`,
    observed_at: observedAt,
    codex_version: codexVersion,
    prompt_probe_status: probeStatus,
    sources,
    source_count: sources.length,
    chain_digest: chainDigest,
    total_instruction_bytes: sources.reduce((sum, source) => sum + (source.bytes ?? 0), 0),
    model_visible_prompt_digest: promptDigest,
    model_visible_prompt_bytes: promptBytes,
    truncated,
    privacy: {
      metadata_only: true,
      source_content_copied: false,
      prompt_content_copied: false,
    },
  };
  return validateInstructionManifest(manifest);
}

export function validateInstructionManifest(value) {
  exactKeys(value, ["schema_version", "manifest_id", "observed_at", "codex_version", "prompt_probe_status", "sources", "source_count", "chain_digest", "total_instruction_bytes", "model_visible_prompt_digest", "model_visible_prompt_bytes", "truncated", "privacy"], "instruction_manifest_shape_invalid");
  if (value.schema_version !== INSTRUCTION_MANIFEST_SCHEMA || !/^aim_[a-f0-9]{64}$/u.test(value.manifest_id)) fail("instruction_manifest_identity_invalid");
  if (!UTC.test(value.observed_at) || !Number.isFinite(Date.parse(value.observed_at))) fail("instruction_manifest_time_invalid");
  if (value.codex_version !== null && (typeof value.codex_version !== "string" || value.codex_version.length > 120 || /[\r\n]/u.test(value.codex_version))) fail("instruction_manifest_codex_version_invalid");
  if (!PROBE_STATES.has(value.prompt_probe_status) || !Array.isArray(value.sources) || value.sources.length > MAX_INSTRUCTION_SOURCES) fail("instruction_manifest_probe_invalid");
  value.sources.forEach((source) => {
    exactKeys(source, ["source_ref", "scope", "access_status", "sha256", "bytes", "model_visible"], "instruction_source_shape_invalid");
    if (typeof source.source_ref !== "string" || source.source_ref.length > 512 || /[\r\n\u0000-\u001f]/u.test(source.source_ref)) fail("instruction_source_ref_invalid");
    if (!SOURCE_SCOPES.has(source.scope) || !ACCESS_STATES.has(source.access_status) || !VISIBILITY_STATES.has(source.model_visible)) fail("instruction_source_state_invalid");
    if (source.access_status === "inspected_public") {
      if (!DIGEST.test(source.sha256) || !Number.isSafeInteger(source.bytes) || source.bytes < 0) fail("instruction_source_metadata_invalid");
    } else if (source.sha256 !== null || source.bytes !== null || source.model_visible !== "unknown") fail("instruction_source_boundary_invalid");
  });
  if (value.source_count !== value.sources.length || !DIGEST.test(value.chain_digest) || !Number.isSafeInteger(value.total_instruction_bytes) || value.total_instruction_bytes < 0) fail("instruction_manifest_totals_invalid");
  if ((value.model_visible_prompt_digest === null) !== (value.model_visible_prompt_bytes === null)) fail("instruction_manifest_prompt_metadata_invalid");
  if (value.model_visible_prompt_digest !== null && (!DIGEST.test(value.model_visible_prompt_digest) || !Number.isSafeInteger(value.model_visible_prompt_bytes) || value.model_visible_prompt_bytes < 0)) fail("instruction_manifest_prompt_metadata_invalid");
  if (value.truncated !== null && typeof value.truncated !== "boolean") fail("instruction_manifest_truncation_invalid");
  exactKeys(value.privacy, ["metadata_only", "source_content_copied", "prompt_content_copied"], "instruction_manifest_privacy_shape_invalid");
  if (value.privacy.metadata_only !== true || value.privacy.source_content_copied !== false || value.privacy.prompt_content_copied !== false) fail("instruction_manifest_privacy_invalid");
  return value;
}

export const persistInstructionManifest = (stateRoot, manifest) => persistStrictMonthlyRecord(stateRoot, {
  directory: "instruction_manifests",
  identityField: "manifest_id",
  timeField: "observed_at",
  kind: "instruction_manifest",
  validate: validateInstructionManifest,
  replayProjection: ({ observed_at: _observedAt, ...stable }) => stable,
}, manifest);

export const loadInstructionManifests = (stateRoot) => loadStrictMonthlyRecords(stateRoot, {
  directory: "instruction_manifests",
  identityField: "manifest_id",
  kind: "instruction_manifest",
  validate: validateInstructionManifest,
});

import { execFile as execFileCallback } from "node:child_process";
import { constants as fsConstants } from "node:fs";
import { access } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";
import { normalizeRepoPath } from "../shared/io.mjs";

const execFile = promisify(execFileCallback);

export const SOURCE_TEXT_RUNTIME_PREFLIGHT_SCHEMA_VERSION =
  "soulforge.source_text_runtime_preflight.v0";
export const SOURCE_TEXT_RUNTIME_PREFLIGHT_VALIDATION_SCHEMA_VERSION =
  "soulforge.source_text_runtime_preflight_validation.v0";
export const SOURCE_TEXT_RUNTIME_PREFLIGHT_GENERATOR_ID =
  "guild_hall.rag.source_text_runtime_preflight.v0";

const REQUIRED_LANGUAGE_IDS = ["eng", "kor", "kor_vert", "osd"];
const REQUIRED_TOOL_IDS = new Set([
  "python_runtime",
  "docling_cli",
  "java_runtime",
  "libreoffice_headless",
  "tesseract_ocr",
  "tesseract_language_data",
]);
const OPTIONAL_TOOL_IDS = new Set(["hwp_hwpx_converter"]);
const STATUS_VALUES = new Set(["ready", "blocked"]);
const TOOL_STATUS_VALUES = new Set(["present", "missing", "not_required"]);
const VERSION_STATUS_VALUES = new Set(["pass", "skipped", "blocked"]);

export async function buildSourceTextRuntimePreflight(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const platform = options.platform ?? process.platform;
  const pathDelimiter = options.pathDelimiter ?? (platform === "win32" ? ";" : path.delimiter);
  const baseEnv = options.env ?? process.env;
  const readWindowsUserEnv = platform === "win32" && options.readWindowsUserEnv !== false;
  const windowsUserEnv = readWindowsUserEnv
    ? await readWindowsUserEnvironment({ runCommand: options.runCommand })
    : {};
  const env = mergeEnvironment(baseEnv, windowsUserEnv);
  const pathEntries = buildPathEntries({
    env,
    baseEnv,
    windowsUserEnv,
    platform,
    pathDelimiter,
    extraPathEntries: options.extraPathEntries,
  });
  const collectVersions = options.collectVersions !== false;
  const runCommand = options.runCommand ?? defaultRunCommand;

  const resolvedTools = [];
  resolvedTools.push(await resolveRepoTool({
    repoRoot,
    platform,
    toolId: "python_runtime",
    label: "Python source extraction runtime",
    required: true,
    repoRefs: platform === "win32"
      ? ["guild_hall/state/tools/source_extraction_venv/Scripts/python.exe"]
      : ["guild_hall/state/tools/source_extraction_venv/bin/python"],
    versionArgs: ["--version"],
  }));
  resolvedTools.push(await resolveRepoTool({
    repoRoot,
    platform,
    toolId: "docling_cli",
    label: "Docling CLI",
    required: true,
    repoRefs: platform === "win32"
      ? ["guild_hall/state/tools/source_extraction_venv/Scripts/docling.exe"]
      : ["guild_hall/state/tools/source_extraction_venv/bin/docling"],
    versionArgs: [],
  }));
  resolvedTools.push(await resolveExecutableTool({
    platform,
    pathEntries,
    env,
    toolId: "java_runtime",
    label: "Java runtime for Tika",
    required: true,
    commandNames: platform === "win32" ? ["java.exe", "java"] : ["java"],
    envHome: "JAVA_HOME",
    envHomeCommandRefs: platform === "win32" ? [["bin", "java.exe"]] : [["bin", "java"]],
    versionArgs: ["-version"],
  }));
  resolvedTools.push(await resolveExecutableTool({
    platform,
    pathEntries,
    env,
    toolId: "libreoffice_headless",
    label: "LibreOffice headless converter",
    required: true,
    commandNames: platform === "win32" ? ["soffice.com", "soffice.exe", "soffice"] : ["soffice"],
    envHome: "LIBREOFFICE_HOME",
    envHomeCommandRefs: platform === "win32"
      ? [["program", "soffice.com"], ["program", "soffice.exe"]]
      : [["program", "soffice"]],
    versionArgs: ["--version"],
  }));
  resolvedTools.push(await resolveExecutableTool({
    platform,
    pathEntries,
    env,
    toolId: "tesseract_ocr",
    label: "Tesseract OCR",
    required: true,
    commandNames: platform === "win32" ? ["tesseract.exe", "tesseract"] : ["tesseract"],
    envHome: "TESSERACT_HOME",
    envHomeCommandRefs: platform === "win32" ? [["tesseract.exe"]] : [["bin", "tesseract"]],
    versionArgs: ["--version"],
  }));
  resolvedTools.push(await resolveTesseractLanguageData({
    repoRoot,
    env,
    requiredLangs: options.requiredLangs ?? REQUIRED_LANGUAGE_IDS,
  }));
  resolvedTools.push(await resolveExecutableTool({
    platform,
    pathEntries,
    env,
    toolId: "hwp_hwpx_converter",
    label: "HWP to HWPX converter",
    required: options.requireHwpConverter === true,
    commandNames: platform === "win32" ? ["HwpConverter.exe", "Hwp.exe"] : [],
    envFile: "HWPX_CONVERTER_CMD",
    envHome: "HANCOM_HOME",
    envHomeCommandRefs: platform === "win32"
      ? [["Bin", "HwpConverter.exe"], ["Bin", "Hwp.exe"]]
      : [],
    versionArgs: [],
    optionalNotRequiredNote: "Required only when this run will normalize .hwp sources to HWPX.",
  }));

  const tools = [];
  for (const resolved of resolvedTools) {
    const report = { ...resolved.report };
    if (collectVersions && resolved.executablePath && report.status === "present" && resolved.versionArgs.length > 0) {
      report.version_probe = await probeToolVersion({
        executablePath: resolved.executablePath,
        versionArgs: resolved.versionArgs,
        env,
        runCommand,
      });
    } else {
      report.version_probe = {
        checked: false,
        status: "skipped",
        summary: collectVersions ? "version_probe_not_applicable" : "version_probe_disabled",
      };
    }
    tools.push(report);
  }

  const blockers = tools.flatMap((tool) => tool.blockers ?? []);
  const status = blockers.length === 0 ? "ready" : "blocked";
  const preflight = {
    schema_version: SOURCE_TEXT_RUNTIME_PREFLIGHT_SCHEMA_VERSION,
    kind: "source_text_runtime_preflight",
    status,
    generated_at_utc: formatTimestampUtc(options.now),
    generator_id: SOURCE_TEXT_RUNTIME_PREFLIGHT_GENERATOR_ID,
    boundary: {
      metadata_only: true,
      preflight_only: true,
      source_files_opened: false,
      source_text_read: false,
      source_payloads_included: false,
      private_payloads_written: false,
      index_build_executed: false,
      runtime_absolute_paths_included: false,
      runtime_paths_redacted: true,
      public_repo_safe: true,
    },
    resolution_policy: {
      purpose: "verify_source_extraction_tool_availability_without_hard_coded_public_paths",
      path_values_are_redacted: true,
      repo_relative_runtime_refs_allowed: true,
      runtime_absolute_paths_must_not_be_persisted_in_public_outputs: true,
      resolution_order: [
        "repo_relative_source_extraction_venv",
        "process_environment_path",
        "windows_user_environment_path",
        "tool_home_environment_variable",
        "tool_file_environment_variable",
        "owner_local_binding_or_manual_preprocess",
      ],
      windows_user_environment_merge_attempted: readWindowsUserEnv,
    },
    counts: {
      required_tool_count: tools.filter((tool) => tool.required).length,
      required_present_count: tools.filter((tool) => tool.required && tool.status === "present").length,
      optional_tool_count: tools.filter((tool) => !tool.required).length,
      blocker_count: blockers.length,
    },
    tools,
    blockers: [...new Set(blockers)].sort(),
    validation: {
      status: "unchecked",
      blockers: [],
    },
  };
  return preflight;
}

export function validateSourceTextRuntimePreflight(preflight) {
  const blockers = [];
  if (preflight?.schema_version !== SOURCE_TEXT_RUNTIME_PREFLIGHT_SCHEMA_VERSION) blockers.push("schema_version_mismatch");
  if (preflight?.kind !== "source_text_runtime_preflight") blockers.push("kind_must_be_source_text_runtime_preflight");
  if (!STATUS_VALUES.has(preflight?.status)) blockers.push("status_unknown");
  const boundary = preflight?.boundary ?? {};
  if (boundary.metadata_only !== true) blockers.push("boundary_metadata_only_must_be_true");
  if (boundary.preflight_only !== true) blockers.push("boundary_preflight_only_must_be_true");
  if (boundary.source_files_opened !== false) blockers.push("source_files_must_not_be_opened");
  if (boundary.source_text_read !== false) blockers.push("source_text_must_not_be_read");
  if (boundary.source_payloads_included !== false) blockers.push("source_payloads_must_not_be_included");
  if (boundary.private_payloads_written !== false) blockers.push("private_payloads_must_not_be_written");
  if (boundary.index_build_executed !== false) blockers.push("index_build_must_not_execute");
  if (boundary.runtime_absolute_paths_included !== false) blockers.push("runtime_absolute_paths_must_not_be_included");
  if (boundary.runtime_paths_redacted !== true) blockers.push("runtime_paths_must_be_redacted");
  if (boundary.public_repo_safe !== true) blockers.push("public_repo_safe_must_be_true");

  const toolIds = new Set();
  for (const tool of Array.isArray(preflight?.tools) ? preflight.tools : []) {
    if (typeof tool?.tool_id !== "string" || !/^[A-Za-z][A-Za-z0-9_]{1,80}$/.test(tool.tool_id)) blockers.push("tool_id_unsafe");
    if (toolIds.has(tool.tool_id)) blockers.push("tool_id_duplicate");
    toolIds.add(tool.tool_id);
    if (typeof tool?.label !== "string" || tool.label.length === 0 || tool.label.length > 120) blockers.push("tool_label_invalid");
    if (typeof tool?.required !== "boolean") blockers.push("tool_required_must_be_boolean");
    if (!TOOL_STATUS_VALUES.has(tool?.status)) blockers.push("tool_status_unknown");
    if (tool?.required === true && tool?.status !== "present") blockers.push(`required_tool_missing:${tool.tool_id}`);
    if (!tool?.resolution || typeof tool.resolution !== "object" || Array.isArray(tool.resolution)) blockers.push("tool_resolution_required");
    if (!tool?.version_probe || !VERSION_STATUS_VALUES.has(tool.version_probe.status)) blockers.push("tool_version_probe_status_unknown");
    if (!Array.isArray(tool?.blockers)) blockers.push("tool_blockers_must_be_array");
  }
  for (const requiredToolId of REQUIRED_TOOL_IDS) {
    if (!toolIds.has(requiredToolId)) blockers.push(`required_tool_report_missing:${requiredToolId}`);
  }
  for (const optionalToolId of OPTIONAL_TOOL_IDS) {
    if (!toolIds.has(optionalToolId)) blockers.push(`optional_tool_report_missing:${optionalToolId}`);
  }

  blockers.push(...findUnsafeRuntimeStrings(preflight));
  return {
    schema_version: SOURCE_TEXT_RUNTIME_PREFLIGHT_VALIDATION_SCHEMA_VERSION,
    kind: "source_text_runtime_preflight_validation",
    status: blockers.length === 0 ? "pass" : "blocked",
    blocker_count: blockers.length,
    blockers: [...new Set(blockers)].sort(),
    boundary: {
      metadata_only: boundary.metadata_only === true,
      no_source_files_opened: boundary.source_files_opened === false,
      no_source_text_read: boundary.source_text_read === false,
      no_source_payloads: boundary.source_payloads_included === false,
      no_private_payloads: boundary.private_payloads_written === false,
      no_index_build: boundary.index_build_executed === false,
      no_runtime_absolute_paths: boundary.runtime_absolute_paths_included === false,
      runtime_paths_redacted: boundary.runtime_paths_redacted === true,
    },
  };
}

async function resolveRepoTool({ repoRoot, toolId, label, required, repoRefs, versionArgs }) {
  for (const repoRef of repoRefs) {
    const candidatePath = path.join(repoRoot, repoRef);
    if (await fileExists(candidatePath)) {
      return {
        executablePath: candidatePath,
        versionArgs,
        report: {
          tool_id: toolId,
          label,
          required,
          status: "present",
          resolution: {
            method: "repo_relative_runtime_ref",
            locator_ref: normalizeRepoPath(repoRef),
            local_path_redacted: true,
          },
          blockers: [],
        },
      };
    }
  }
  return missingTool({ toolId, label, required, method: "repo_relative_runtime_ref", versionArgs });
}

async function resolveExecutableTool({
  platform,
  pathEntries,
  env,
  toolId,
  label,
  required,
  commandNames,
  envFile,
  envHome,
  envHomeCommandRefs,
  versionArgs,
  optionalNotRequiredNote,
}) {
  const envFileValue = envFile ? getEnvValue(env, envFile) : undefined;
  if (envFileValue && await fileExists(expandEnvVars(envFileValue, env))) {
    return resolvedExecutable({
      executablePath: expandEnvVars(envFileValue, env),
      toolId,
      label,
      required,
      versionArgs,
      resolution: {
        method: "tool_file_environment_variable",
        env_name: envFile,
        local_path_redacted: true,
      },
    });
  }

  const envHomeValue = envHome ? getEnvValue(env, envHome) : undefined;
  if (envHomeValue) {
    for (const commandRef of envHomeCommandRefs ?? []) {
      const candidatePath = path.join(expandEnvVars(envHomeValue, env), ...commandRef);
      if (await fileExists(candidatePath)) {
        return resolvedExecutable({
          executablePath: candidatePath,
          toolId,
          label,
          required,
          versionArgs,
          resolution: {
            method: "tool_home_environment_variable",
            env_name: envHome,
            command_label: commandRef.at(-1),
            local_path_redacted: true,
          },
        });
      }
    }
  }

  for (const commandName of commandNames) {
    const found = await findCommandInPath({ commandName, pathEntries, platform });
    if (found) {
      return resolvedExecutable({
        executablePath: found.executablePath,
        toolId,
        label,
        required,
        versionArgs,
        resolution: {
          method: "path_search",
          command_label: commandName,
          path_source: found.source,
          local_path_redacted: true,
        },
      });
    }
  }

  if (!required) {
    return {
      executablePath: null,
      versionArgs,
      report: {
        tool_id: toolId,
        label,
        required,
        status: "not_required",
        resolution: {
          method: "owner_local_binding_or_manual_preprocess",
          local_path_redacted: true,
          note: optionalNotRequiredNote ?? "Optional for this preflight.",
        },
        blockers: [],
      },
    };
  }
  return missingTool({
    toolId,
    label,
    required,
    method: "path_or_environment_resolution",
    versionArgs,
  });
}

async function resolveTesseractLanguageData({ repoRoot, env, requiredLangs }) {
  const repoTessdataRef = "guild_hall/state/tools/tessdata";
  const repoTessdataPath = path.join(repoRoot, repoTessdataRef);
  const repoLangStatus = await checkTessdataLanguages(repoTessdataPath, requiredLangs);
  if (repoLangStatus.every((lang) => lang.present)) {
    return {
      executablePath: null,
      versionArgs: [],
      report: {
        tool_id: "tesseract_language_data",
        label: "Tesseract OCR language data",
        required: true,
        status: "present",
        resolution: {
          method: "repo_relative_runtime_ref",
          locator_ref: repoTessdataRef,
          local_path_redacted: true,
        },
        language_status: repoLangStatus,
        blockers: [],
      },
    };
  }

  const tessdataPrefix = getEnvValue(env, "TESSDATA_PREFIX");
  if (tessdataPrefix) {
    const envLangStatus = await checkTessdataLanguages(expandEnvVars(tessdataPrefix, env), requiredLangs);
    if (envLangStatus.every((lang) => lang.present)) {
      return {
        executablePath: null,
        versionArgs: [],
        report: {
          tool_id: "tesseract_language_data",
          label: "Tesseract OCR language data",
          required: true,
          status: "present",
          resolution: {
            method: "tool_home_environment_variable",
            env_name: "TESSDATA_PREFIX",
            local_path_redacted: true,
          },
          language_status: envLangStatus,
          blockers: [],
        },
      };
    }
    return {
      executablePath: null,
      versionArgs: [],
      report: {
        tool_id: "tesseract_language_data",
        label: "Tesseract OCR language data",
        required: true,
        status: "missing",
        resolution: {
          method: "tool_home_environment_variable",
          env_name: "TESSDATA_PREFIX",
          local_path_redacted: true,
        },
        language_status: envLangStatus,
        blockers: missingLanguageBlockers(envLangStatus),
      },
    };
  }

  return {
    executablePath: null,
    versionArgs: [],
    report: {
      tool_id: "tesseract_language_data",
      label: "Tesseract OCR language data",
      required: true,
      status: "missing",
      resolution: {
        method: "repo_relative_or_tessdata_prefix",
        locator_ref: repoTessdataRef,
        env_name: "TESSDATA_PREFIX",
        local_path_redacted: true,
      },
      language_status: repoLangStatus,
      blockers: missingLanguageBlockers(repoLangStatus),
    },
  };
}

function resolvedExecutable({ executablePath, toolId, label, required, versionArgs, resolution }) {
  return {
    executablePath,
    versionArgs,
    report: {
      tool_id: toolId,
      label,
      required,
      status: "present",
      resolution,
      blockers: [],
    },
  };
}

function missingTool({ toolId, label, required, method, versionArgs }) {
  return {
    executablePath: null,
    versionArgs,
    report: {
      tool_id: toolId,
      label,
      required,
      status: "missing",
      resolution: {
        method,
        local_path_redacted: true,
      },
      blockers: required ? [`required_tool_not_resolved:${toolId}`] : [],
    },
  };
}

async function probeToolVersion({ executablePath, versionArgs, env, runCommand }) {
  try {
    const result = await runCommand(executablePath, versionArgs, {
      env,
      timeoutMs: 10000,
    });
    return {
      checked: true,
      status: "pass",
      summary: sanitizeVersionSummary(`${result.stdout ?? ""}\n${result.stderr ?? ""}`),
    };
  } catch (error) {
    const summary = sanitizeVersionSummary(`${error.stdout ?? ""}\n${error.stderr ?? ""}`);
    return {
      checked: true,
      status: "blocked",
      summary: summary || "version_probe_failed_without_safe_output",
    };
  }
}

async function defaultRunCommand(command, args, { env, timeoutMs } = {}) {
  return execFile(command, args, {
    env,
    timeout: timeoutMs ?? 10000,
    windowsHide: true,
  });
}

async function readWindowsUserEnvironment({ runCommand } = {}) {
  const runner = runCommand ?? defaultRunCommand;
  const env = {};
  for (const name of [
    "Path",
    "JAVA_HOME",
    "LIBREOFFICE_HOME",
    "TESSERACT_HOME",
    "TESSDATA_PREFIX",
    "HWPX_CONVERTER_CMD",
    "HANCOM_HOME",
  ]) {
    const value = await readWindowsUserEnvironmentValue(name, runner);
    if (value) env[name] = value;
  }
  return env;
}

async function readWindowsUserEnvironmentValue(name, runCommand) {
  try {
    const { stdout } = await runCommand("reg.exe", ["query", "HKCU\\Environment", "/v", name], {
      env: process.env,
      timeoutMs: 5000,
    });
    return parseRegQueryValue(stdout, name);
  } catch {
    return undefined;
  }
}

function parseRegQueryValue(stdout, name) {
  const lines = String(stdout ?? "").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.toLowerCase().startsWith(name.toLowerCase())) continue;
    const parts = trimmed.split(/\s{2,}/);
    if (parts.length >= 3) return parts.slice(2).join("  ");
  }
  return undefined;
}

function mergeEnvironment(baseEnv, overrideEnv) {
  const merged = { ...baseEnv };
  for (const [key, value] of Object.entries(overrideEnv ?? {})) {
    if (value !== undefined && getEnvValue(merged, key) === undefined) {
      merged[key] = value;
    }
  }
  return merged;
}

function buildPathEntries({ env, baseEnv, windowsUserEnv, platform, pathDelimiter, extraPathEntries = [] }) {
  const entries = [];
  addPathEntries(entries, getEnvValue(baseEnv, "PATH") ?? getEnvValue(baseEnv, "Path"), "process_environment_path", pathDelimiter, env);
  addPathEntries(entries, windowsUserEnv?.Path, "windows_user_environment_path", pathDelimiter, env);
  for (const entry of extraPathEntries) {
    if (typeof entry === "string" && entry.length > 0) entries.push({ dir: entry, source: "explicit_test_path" });
  }
  return dedupePathEntries(entries, platform);
}

function addPathEntries(entries, pathValue, source, pathDelimiter, env) {
  if (!pathValue) return;
  for (const rawEntry of String(pathValue).split(pathDelimiter)) {
    const entry = expandEnvVars(rawEntry.trim(), env);
    if (entry.length > 0) entries.push({ dir: entry, source });
  }
}

function dedupePathEntries(entries, platform) {
  const seen = new Set();
  const deduped = [];
  for (const entry of entries) {
    const key = platform === "win32" ? entry.dir.toLowerCase() : entry.dir;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(entry);
  }
  return deduped;
}

async function findCommandInPath({ commandName, pathEntries, platform }) {
  const candidateNames = commandName.includes(".") || platform !== "win32"
    ? [commandName]
    : [`${commandName}.exe`, `${commandName}.cmd`, `${commandName}.bat`, commandName];
  for (const entry of pathEntries) {
    for (const candidateName of candidateNames) {
      const candidatePath = path.join(entry.dir, candidateName);
      if (await fileExists(candidatePath)) {
        return {
          executablePath: candidatePath,
          source: entry.source,
        };
      }
    }
  }
  return null;
}

async function checkTessdataLanguages(tessdataPath, requiredLangs) {
  const statuses = [];
  for (const lang of requiredLangs) {
    const langPath = path.join(tessdataPath, `${lang}.traineddata`);
    statuses.push({
      lang,
      present: await fileExists(langPath),
    });
  }
  return statuses;
}

function missingLanguageBlockers(languageStatus) {
  return languageStatus
    .filter((lang) => !lang.present)
    .map((lang) => `required_tessdata_missing:${lang.lang}`);
}

async function fileExists(filePath) {
  try {
    await access(filePath, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function getEnvValue(env, key) {
  if (!env) return undefined;
  if (env[key] !== undefined) return env[key];
  const foundKey = Object.keys(env).find((candidate) => candidate.toLowerCase() === key.toLowerCase());
  return foundKey ? env[foundKey] : undefined;
}

function expandEnvVars(value, env) {
  return String(value).replace(/%([^%]+)%/g, (_match, name) => getEnvValue(env, name) ?? "");
}

function sanitizeVersionSummary(output) {
  const firstLine = String(output ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  if (!firstLine) return "version_output_empty";
  if (isUnsafeRuntimeString(firstLine)) return "version_output_redacted";
  return firstLine.slice(0, 200);
}

function findUnsafeRuntimeStrings(value, trail = []) {
  const blockers = [];
  if (typeof value === "string") {
    if (isUnsafeRuntimeString(value)) {
      blockers.push(`unsafe_runtime_string:${trail.join(".") || "root"}`);
    }
    return blockers;
  }
  if (!value || typeof value !== "object") return blockers;
  if (Array.isArray(value)) {
    value.forEach((item, index) => blockers.push(...findUnsafeRuntimeStrings(item, [...trail, String(index)])));
    return blockers;
  }
  for (const [key, item] of Object.entries(value)) {
    if (/path|absolute|payload|secret|token|session/i.test(key) && typeof item === "string") {
      if (isUnsafeRuntimeString(item)) blockers.push(`unsafe_runtime_field:${[...trail, key].join(".")}`);
    }
    blockers.push(...findUnsafeRuntimeStrings(item, [...trail, key]));
  }
  return blockers;
}

function isUnsafeRuntimeString(value) {
  return /[A-Za-z]:[\\/]|(^|[\\/])Users[\\/]|(^|[\\/])Volumes[\\/]|file:\/\//.test(value);
}

function formatTimestampUtc(value) {
  if (value) return new Date(value).toISOString();
  return new Date().toISOString();
}

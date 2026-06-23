import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

export function resolveCodexHome() {
  return process.env.CODEX_HOME || path.join(os.homedir(), ".codex");
}

export async function buildRequiredCodexRuntimeSkillResult(item, options = {}) {
  const codexHome = options.codexHome ?? resolveCodexHome();
  const installName = item.install_name ?? item.name ?? item.id;
  const skillPath = path.join(codexHome, "skills", installName, "SKILL.md");
  const exists = await pathExists(skillPath);

  return {
    id: item.id,
    label: item.label ?? installName,
    category: "required_codex_runtime_skill",
    required: item.required ?? true,
    status: exists ? "ok" : "missing",
    path: skillPath,
    detail: exists ? `installed: ${installName}` : `missing installed skill: ${installName}`,
  };
}

export async function buildRequiredCodexStopHookResult(item, options = {}) {
  const codexHome = options.codexHome ?? resolveCodexHome();
  const repoRoot = options.repoRoot ?? process.cwd();
  const configPath = options.configPath ?? path.join(codexHome, "config.toml");
  const scriptRef = item.script_ref ?? item.script;
  const scriptPath = path.resolve(repoRoot, scriptRef);

  if (!(await pathExists(scriptPath))) {
    return {
      id: item.id,
      label: item.label ?? scriptRef,
      category: "required_codex_stop_hook",
      required: item.required ?? true,
      status: "blocked",
      path: scriptPath,
      detail: `hook script missing: ${scriptRef}`,
    };
  }

  let configText;
  try {
    configText = await fs.readFile(configPath, "utf8");
  } catch {
    return {
      id: item.id,
      label: item.label ?? scriptRef,
      category: "required_codex_stop_hook",
      required: item.required ?? true,
      status: "missing",
      path: configPath,
      detail: "missing Codex config.toml",
    };
  }

  const configured = hasStopHookCommand(configText, scriptRef);
  return {
    id: item.id,
    label: item.label ?? scriptRef,
    category: "required_codex_stop_hook",
    required: item.required ?? true,
    status: configured ? "ok" : "missing",
    path: configPath,
    detail: configured ? `configured: ${scriptRef}` : `Stop hook not configured for ${scriptRef}`,
  };
}

export function hasStopHookCommand(configText, scriptRef) {
  const normalizedConfig = normalizeForMatch(configText);
  const normalizedScript = normalizeForMatch(scriptRef);
  const scriptName = path.posix.basename(normalizedScript);

  return normalizedConfig.includes("[[hooks.stop")
    && (normalizedConfig.includes(normalizedScript) || normalizedConfig.includes(scriptName));
}

function normalizeForMatch(value) {
  return String(value ?? "")
    .replaceAll("\\", "/")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

async function pathExists(filePath) {
  try {
    await fs.stat(filePath);
    return true;
  } catch {
    return false;
  }
}

#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import {
  buildRequiredCodexRuntimeSkillResult,
  buildRequiredCodexStopHookResult,
  resolveCodexHome,
} from "./codex_runtime_checks.mjs";
import { buildDoctorFatalPayload, printDoctorHuman, printDoctorJson } from "./reporting.mjs";
import {
  pathExists,
  relativeToRepo,
  relativeToRepoOrAbsolute as sharedRelativeToRepoOrAbsolute,
  writeJson,
} from "../shared/io.mjs";
import { pythonBin } from "../shared/python_bin.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");
const checklistPath = path.join(repoRoot, "docs", "architecture", "bootstrap", "BOOTSTRAP_CHECKLIST_V0.json");
const statusFilePath = path.join(repoRoot, "guild_hall", "state", "doctor", "status.json");
const registrySkillsRoot = path.join(repoRoot, ".registry", "skills");
const nodeIdentityPath = path.join(repoRoot, "guild_hall", "state", "local", "node_identity.yaml");
const doctorSchemaVersion = "bootstrap.doctor.v0";
const supportedNodeRoles = new Set(["work_pc", "tool_pc", "portable_dev_pc", "dev_worker_pc", "always_on_node"]);

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const checklist = JSON.parse(await fs.readFile(checklistPath, "utf8"));
  const profile = resolveProfile(args.profile, checklist);
  const report = await runDoctor(checklist, {
    live: Boolean(args.live),
    remote: Boolean(args.remote),
    profile,
  });
  await writeStatus(report);

  if (args.json) {
    printDoctorJson(report);
  } else {
    printDoctorHuman(report);
  }

  if (!report.ready) {
    process.exitCode = 1;
  }
}

function parseArgs(argv) {
  const flags = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      continue;
    }

    const key = token.slice(2);
    const next = argv[index + 1];
    if (next === undefined || next.startsWith("--")) {
      flags[key] = true;
      continue;
    }

    flags[key] = next;
    index += 1;
  }

  return flags;
}

async function runDoctor(checklist, options = {}) {
  const results = [];
  const toolAvailability = new Map();
  const nextSteps = [];
  const profile = options.profile ?? resolveProfile(undefined, checklist);
  const nodeIdentityResult = withFixHint(await runNodeIdentityCheck(profile, checklist), { profile });
  results.push(nodeIdentityResult);
  if (nodeIdentityResult.required && nodeIdentityResult.status !== "ok") {
    nextSteps.push(nodeIdentityResult.fix_hint ?? "local node identity 를 만든 뒤 doctor 를 다시 실행한다.");
  }

  for (const item of checklist.required_tools ?? []) {
    if (!itemAppliesToProfile(item, profile)) {
      continue;
    }
    const result = withFixHint(runCommandCheck({
      id: item.id,
      label: item.label,
      category: "required_tool",
      command: item.command,
      required: true,
    }), { item });
    results.push(result);
    toolAvailability.set(item.command[0], result.status === "ok");
    if (result.status !== "ok") {
      nextSteps.push(result.fix_hint ?? `필수 도구 설치: ${item.label}`);
    }
  }

  for (const item of checklist.optional_tools ?? []) {
    if (!itemAppliesToProfile(item, profile)) {
      continue;
    }
    const result = withFixHint(runCommandCheck({
      id: item.id,
      label: item.label,
      category: "optional_tool",
      command: item.command,
      required: false,
    }), { item });
    results.push(result);
  }

  const requiredSkillNames = await resolveRequiredSkillNames(checklist);

  for (const skillName of requiredSkillNames) {
    const skillPath = path.join(resolveCodexHome(), "skills", skillName, "SKILL.md");
    const exists = await pathExists(skillPath);
    const result = withFixHint({
      id: `skill_${skillName}`,
      label: skillName,
      category: "required_skill",
      required: true,
      status: exists ? "ok" : "missing",
      path: relativeToRepoOrAbsolute(skillPath),
      detail: exists ? "installed" : "missing",
    }, { item: { id: `skill_${skillName}` } });
    results.push(result);
    if (!exists) {
      nextSteps.push(result.fix_hint ?? `필수 Soulforge skill 설치: ${skillName}`);
    }
  }

  for (const item of checklist.required_codex_runtime_skills ?? []) {
    if (!itemAppliesToProfile(item, profile)) {
      continue;
    }
    const rawResult = await buildRequiredCodexRuntimeSkillResult(item);
    const result = withFixHint({
      ...rawResult,
      path: relativeToRepoOrAbsolute(rawResult.path),
    }, { item });
    results.push(result);
    if (result.status !== "ok") {
      nextSteps.push(result.fix_hint ?? `필수 Codex runtime skill 설치: ${item.install_name ?? item.id}`);
    }
  }

  for (const item of checklist.required_codex_stop_hooks ?? []) {
    if (!itemAppliesToProfile(item, profile)) {
      continue;
    }
    const rawResult = await buildRequiredCodexStopHookResult(item, { repoRoot });
    const result = withFixHint({
      ...rawResult,
      path: relativeToRepoOrAbsolute(rawResult.path),
    }, { item });
    results.push(result);
    if (result.status !== "ok") {
      nextSteps.push(result.fix_hint ?? `필수 Codex Stop hook 설정: ${item.script_ref ?? item.id}`);
    }
  }

  for (const item of checklist.required_local_files ?? []) {
    if (!itemAppliesToProfile(item, profile)) {
      continue;
    }
    const filePath = path.join(repoRoot, item.path);
    const exists = await pathExists(filePath);
    const result = withFixHint({
      id: item.id,
      label: item.label,
      category: "required_local_file",
      required: true,
      status: exists ? "ok" : "missing",
      path: item.path,
      template: item.template ?? null,
      detail: exists ? "present" : "missing",
    }, { item });
    results.push(result);
    if (!exists) {
      nextSteps.push(result.fix_hint ?? (item.template ? `local 파일 생성: ${item.path} <= ${item.template}` : `local 파일 생성: ${item.path}`));
    }
  }

  for (const item of checklist.optional_local_files ?? []) {
    if (!itemAppliesToProfile(item, profile)) {
      continue;
    }
    const filePath = path.join(repoRoot, item.path);
    const exists = await pathExists(filePath);
    results.push(withFixHint({
      id: item.id,
      label: item.label,
      category: "optional_local_file",
      required: false,
      status: exists ? "ok" : "missing",
      path: item.path,
      template: item.template ?? null,
      detail: exists ? "present" : item.note ?? "missing",
    }, { item }));
  }

  for (const item of checklist.optional_local_paths ?? []) {
    if (!itemAppliesToProfile(item, profile)) {
      continue;
    }
    const resolvedPath = await resolveLocalPathForCurrentPlatform(item.path);
    const exists = resolvedPath.exists;
    results.push(withFixHint({
      id: item.id,
      label: item.label,
      category: "optional_local_path",
      required: false,
      status: exists ? "ok" : "missing",
      path: relativeToRepoOrAbsolute(resolvedPath.path),
      detail: exists ? "present" : item.note ?? "missing",
    }, { item }));
  }

  for (const item of checklist.profile_local_paths ?? []) {
    if (!item.profiles?.includes(profile)) {
      continue;
    }

    const resolvedPath = await resolveLocalPathForCurrentPlatform(item.path);
    const exists = resolvedPath.exists;
    const required = Boolean(item.required);
    const result = withFixHint({
      id: item.id,
      label: item.label,
      category: "profile_local_path",
      required,
      status: exists ? "ok" : "missing",
      path: relativeToRepoOrAbsolute(resolvedPath.path),
      detail: exists ? "present" : item.note ?? "missing",
    }, { item, profile });
    results.push(result);

    if (!exists && required) {
      nextSteps.push(result.fix_hint ?? `profile ${profile} 준비: ${item.path}`);
    }
  }

  for (const item of checklist.safe_smokes ?? []) {
    if (!itemAppliesToProfile(item, profile)) {
      continue;
    }
    const executable = item.command[0];
    if (!toolAvailability.get(executable)) {
      const result = withFixHint({
        id: item.id,
        label: item.label,
        category: "safe_smoke",
        required: true,
        status: "blocked",
        command: item.command,
        detail: `missing required tool: ${executable}`,
      }, { item });
      results.push(result);
      nextSteps.push(result.fix_hint ?? `필수 도구 설치 후 다시 실행: ${item.label}`);
      continue;
    }

    const result = withFixHint(runCommandCheck({
      id: item.id,
      label: item.label,
      category: "safe_smoke",
      command: item.command,
      required: true,
    }), { item });
    results.push(result);
    if (result.status !== "ok") {
      nextSteps.push(result.fix_hint ?? `safe smoke 확인: ${item.label}`);
    }
  }

  let remoteCheckResults = [];
  let liveSmokeResults = [];

  if (options.remote) {
    remoteCheckResults = runRemoteChecks(checklist.remote_checks ?? [], {
      profile,
      checklist,
    });
    results.push(...remoteCheckResults);
    if (!remoteCheckResults.every((item) => item.status === "ok")) {
      nextSteps.push(
        ...remoteCheckResults
          .filter((item) => item.status !== "ok")
          .map((item) => item.fix_hint ?? "GitHub auth, remote sync, private state repo 연결 상태를 확인한다."),
      );
    }
  } else {
    nextSteps.push("GitHub/버전 점검이 필요하면: npm run guild-hall:doctor -- --remote");
  }

  if (options.live) {
    liveSmokeResults = runLiveChecks(
      (checklist.live_smokes ?? []).filter((item) => itemAppliesToProfile(item, profile)),
    );
    results.push(...liveSmokeResults);
    if (!liveSmokeResults.every((item) => item.status === "ok")) {
      nextSteps.push(
        ...liveSmokeResults
          .filter((item) => item.status !== "ok")
          .map((item) => item.fix_hint ?? "live 외부 인증/연결 상태를 확인한다."),
      );
    }
  } else {
    nextSteps.push("live 외부 점검이 필요하면: npm run guild-hall:doctor -- --live");
  }

  const requiredResults = results.filter((item) => item.required);
  const requiredPassed = requiredResults.filter((item) => item.status === "ok").length;
  const profileResults = results.filter((item) => item.category === "profile_local_path");
  const profilePassed = profileResults.filter((item) => item.status === "ok").length;
  const nodeIdentityResults = results.filter((item) => item.category === "node_identity");
  const nodeIdentityPassed = nodeIdentityResults.filter((item) => item.status === "ok").length;
  const safeSmokeResults = results.filter((item) => item.category === "safe_smoke");
  const safeSmokesPassed = safeSmokeResults.filter((item) => item.status === "ok").length;
  const codexRuntimeSkillResults = results.filter((item) => item.category === "required_codex_runtime_skill");
  const codexRuntimeSkillsPassed = codexRuntimeSkillResults.filter((item) => item.status === "ok").length;
  const codexStopHookResults = results.filter((item) => item.category === "required_codex_stop_hook");
  const codexStopHooksPassed = codexStopHookResults.filter((item) => item.status === "ok").length;
  const remoteChecksPassed = remoteCheckResults.filter((item) => item.status === "ok").length;
  const liveSmokesPassed = liveSmokeResults.filter((item) => item.status === "ok").length;
  const ready = requiredResults.every((item) => item.status === "ok");

  for (const item of checklist.live_followups ?? []) {
    if (!itemAppliesToProfile(item, profile)) {
      continue;
    }
    nextSteps.push(`live check 준비: ${item.command}`);
  }

  return {
    schema_version: doctorSchemaVersion,
    doctor_version: checklist.version ?? "v0",
    checklist_version: checklist.checklist_version ?? checklist.version ?? "v0",
    profile,
    mode: resolveMode(options),
    generated_at: new Date().toISOString(),
    repo_root: repoRoot,
    ready,
    summary: {
      required_passed: requiredPassed,
      required_total: requiredResults.length,
      node_identity_passed: nodeIdentityPassed,
      node_identity_total: nodeIdentityResults.length,
      profile_checks_passed: profilePassed,
      profile_checks_total: profileResults.length,
      safe_smokes_passed: safeSmokesPassed,
      safe_smokes_total: safeSmokeResults.length,
      codex_runtime_skills_passed: codexRuntimeSkillsPassed,
      codex_runtime_skills_total: codexRuntimeSkillResults.length,
      codex_stop_hooks_passed: codexStopHooksPassed,
      codex_stop_hooks_total: codexStopHookResults.length,
      remote_checks_passed: remoteChecksPassed,
      remote_checks_total: remoteCheckResults.length,
      live_smokes_passed: liveSmokesPassed,
      live_smokes_total: liveSmokeResults.length,
    },
    status_file: relativeToRepo(repoRoot, statusFilePath),
    checklist_file: relativeToRepo(repoRoot, checklistPath),
    results,
    next_steps: dedupePreserveOrder(nextSteps),
  };
}

async function runNodeIdentityCheck(profile, checklist) {
  const required = profile !== "public-only";
  const identityPath = relativeToRepo(repoRoot, nodeIdentityPath);

  if (!(await pathExists(nodeIdentityPath))) {
    return {
      id: "local_node_identity",
      label: "local node identity",
      category: "node_identity",
      required,
      status: "missing",
      path: identityPath,
      detail: required ? "missing" : "missing; optional for public-only profile",
    };
  }

  let identity;
  try {
    identity = parseYaml(await fs.readFile(nodeIdentityPath, "utf8"));
  } catch (error) {
    return {
      id: "local_node_identity",
      label: "local node identity",
      category: "node_identity",
      required,
      status: "failed",
      path: identityPath,
      detail: `parse failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  const issues = [];
  const supportedProfiles = checklist.profile_defaults?.supported ?? ["public-only"];

  if (!identity || typeof identity !== "object" || Array.isArray(identity)) {
    issues.push("identity must be a YAML object");
  }

  const schemaVersion = readString(identity?.schema_version);
  const nodeId = readString(identity?.node_id);
  const nodeRole = readString(identity?.node_role);
  const bootstrapProfile = readString(identity?.bootstrap_profile);
  const soulforgeRoot = readString(identity?.local_paths?.soulforge_root);

  if (schemaVersion !== "soulforge.local_node.v0") {
    issues.push("schema_version must be soulforge.local_node.v0");
  }
  if (!nodeId) {
    issues.push("node_id is required");
  }
  if (!supportedNodeRoles.has(nodeRole)) {
    issues.push(`node_role must be one of ${Array.from(supportedNodeRoles).join(", ")}`);
  }
  let profileNote = null;
  if (!supportedProfiles.includes(bootstrapProfile)) {
    issues.push(`bootstrap_profile must be one of ${supportedProfiles.join(", ")}`);
  } else if (bootstrapProfile !== profile && required) {
    issues.push(`bootstrap_profile ${bootstrapProfile} does not match requested doctor profile ${profile}`);
  } else if (bootstrapProfile !== profile) {
    profileNote = `requested_profile=${profile}`;
  }
  if (!soulforgeRoot) {
    issues.push("local_paths.soulforge_root is required");
  } else if (path.resolve(soulforgeRoot) !== repoRoot) {
    issues.push(`local_paths.soulforge_root does not match current repo root ${repoRoot}`);
  }

  const gitState = readGitIgnoreState(identityPath);
  if (gitState.tracked) {
    issues.push("node_identity.yaml must not be tracked by public Git");
  }

  const detail = [
    `node_id=${nodeId || "(missing)"}`,
    `node_role=${nodeRole || "(missing)"}`,
    `bootstrap_profile=${bootstrapProfile || "(missing)"}`,
    `soulforge_root=${soulforgeRoot || "(missing)"}`,
    `git=${gitState.tracked ? "tracked" : gitState.ignored ? "ignored/untracked" : "untracked"}`,
    profileNote,
    issues.length > 0 ? `issues=${issues.join("; ")}` : null,
  ].filter(Boolean).join(" | ");

  return {
    id: "local_node_identity",
    label: "local node identity",
    category: "node_identity",
    required,
    status: issues.length > 0 ? "failed" : "ok",
    path: identityPath,
    detail,
  };
}

async function resolveRequiredSkillNames(checklist) {
  if (checklist.required_skill_policy === "all_syncable_codex_bridges") {
    return listSyncableSoulforgeCodexSkillNames();
  }

  return checklist.required_skills ?? [];
}

async function listSyncableSoulforgeCodexSkillNames() {
  const entries = await fs.readdir(registrySkillsRoot, { withFileTypes: true });
  const skillNames = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const bridgeSkillPath = path.join(registrySkillsRoot, entry.name, "codex", "SKILL.md");
    if (!(await pathExists(bridgeSkillPath))) {
      continue;
    }

    skillNames.push(`soulforge-${entry.name.replaceAll("_", "-")}`);
  }

  return skillNames.sort((left, right) => left.localeCompare(right));
}

function runCommandCheck({ id, label, category, command, required }) {
  const execution = runChecklistCommand(command);

  if (isCommandNotFound(execution, command[0])) {
    return {
      id,
      label,
      category,
      required,
      status: "missing",
      command,
      detail: `command not found: ${command[0]}`,
    };
  }

  const stdout = String(execution.stdout ?? "").trim();
  const stderr = String(execution.stderr ?? "").trim();
  const detail = stderr || stdout || (execution.status === 0 ? "ok" : `exit ${execution.status ?? "unknown"}`);

  return {
    id,
    label,
    category,
    required,
    status: execution.status === 0 ? "ok" : "failed",
    command,
    detail,
  };
}

function runChecklistCommand(command) {
  const options = {
    cwd: repoRoot,
    encoding: "utf8",
  };

  if (process.platform !== "win32") {
    return spawnSync(command[0], command.slice(1), options);
  }

  return spawnSync(command.map(quoteWindowsShellArg).join(" "), {
    ...options,
    shell: true,
  });
}

function quoteWindowsShellArg(value) {
  const text = String(value);
  if (/^[A-Za-z0-9_./:=@+-]+$/.test(text)) {
    return text;
  }

  return `"${text.replaceAll('"', '\\"')}"`;
}

function isCommandNotFound(execution, commandName) {
  if (execution.error?.code === "ENOENT") {
    return true;
  }

  if (process.platform !== "win32") {
    return false;
  }

  const output = `${execution.stderr ?? ""}\n${execution.stdout ?? ""}`.toLowerCase();
  return output.includes(String(commandName).toLowerCase()) && output.includes("is not recognized");
}

function readString(value) {
  return typeof value === "string" ? value : "";
}

async function resolveLocalPathForCurrentPlatform(relativePath) {
  const candidates = [path.resolve(repoRoot, relativePath)];

  if (process.platform === "win32") {
    const normalized = relativePath.replaceAll("\\", "/");
    if (normalized.endsWith("/bin/python")) {
      const venvRoot = normalized.slice(0, -"/bin/python".length);
      candidates.push(path.resolve(repoRoot, venvRoot, "Scripts", "python.exe"));
    }
  }

  for (const candidate of candidates) {
    if (await pathExists(candidate)) {
      return { exists: true, path: candidate };
    }
  }

  return { exists: false, path: candidates[0] };
}

function readGitIgnoreState(filePath) {
  const relativePath = relativeToRepo(repoRoot, filePath);
  const tracked = spawnSync("git", ["ls-files", "--error-unmatch", relativePath], {
    cwd: repoRoot,
    encoding: "utf8",
  }).status === 0;
  const ignored = spawnSync("git", ["check-ignore", "-q", relativePath], {
    cwd: repoRoot,
    encoding: "utf8",
  }).status === 0;

  return { ignored, tracked };
}

function runLiveChecks(checklistItems) {
  const execution = spawnSync(pythonBin(), ["guild_hall/doctor/live_checks.py", "--json"], {
    cwd: repoRoot,
    encoding: "utf8",
  });

  if (execution.error?.code === "ENOENT") {
    return buildLiveFallbackResults(checklistItems, `command not found: ${pythonBin()}`);
  }

  const stdout = String(execution.stdout ?? "").trim();
  const stderr = String(execution.stderr ?? "").trim();
  const payload = tryParseJson(stdout);

  if (!payload || !Array.isArray(payload.results)) {
    const detail = stderr || stdout || `exit ${execution.status ?? "unknown"}`;
    return buildLiveFallbackResults(checklistItems, `live check output parse failed: ${detail}`);
  }

  const byId = new Map(
    payload.results
      .filter((item) => item && typeof item === "object" && typeof item.id === "string")
      .map((item) => [
        item.id,
        withFixHint({
          id: item.id,
          label: item.label ?? item.id,
          category: "live_smoke",
          required: true,
          status: item.status ?? "failed",
          detail: item.detail ?? (execution.status === 0 ? "ok" : `exit ${execution.status ?? "unknown"}`),
        }, { item }),
      ]),
  );

  return checklistItems.map((item) => {
    const result = byId.get(item.id);
    if (result) {
      return withFixHint({
        ...result,
        label: item.label ?? result.label,
      }, { item });
    }

    return withFixHint({
      id: item.id,
      label: item.label,
      category: "live_smoke",
      required: true,
      status: "blocked",
      detail: `missing live result: ${item.id}`,
    }, { item });
  });
}

function buildLiveFallbackResults(checklistItems, detail) {
  return checklistItems.map((item) => withFixHint({
    id: item.id,
    label: item.label,
    category: "live_smoke",
    required: true,
    status: "failed",
    detail,
  }, { item }));
}

function runRemoteChecks(checklistItems, context) {
  const privateRepoRoot = resolvePrivateStateRepoRoot(context.checklist);

  return checklistItems
    .filter((item) => !item.profiles || item.profiles.includes(context.profile))
    .map((item) => {
      if (item.type === "gh_auth") {
        return withFixHint(runCommandCheck({
          id: item.id,
          label: item.label,
          category: "remote_check",
          command: ["gh", "auth", "status"],
          required: true,
        }), { item, profile: context.profile });
      }

      const repoPath = item.target === "private" ? privateRepoRoot : repoRoot;
      if (!repoPath || !existsSync(repoPath)) {
        return withFixHint({
          id: item.id,
          label: item.label,
          category: "remote_check",
          required: true,
          status: "blocked",
          detail: item.target === "private" ? "private state repo missing" : "repo root missing",
        }, { item, profile: context.profile });
      }

      if (item.type === "git_origin") {
        return runGitOriginCheck(item, repoPath);
      }

      if (item.type === "git_sync") {
        return runGitSyncCheck(item, repoPath);
      }

      return withFixHint({
        id: item.id,
        label: item.label,
        category: "remote_check",
        required: true,
        status: "failed",
        detail: `unsupported remote check type: ${item.type ?? "unknown"}`,
      }, { item, profile: context.profile });
    });
}

function runGitOriginCheck(item, repoPath) {
  const execution = spawnSync("git", ["-C", repoPath, "remote", "get-url", "origin"], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  const detail = String(execution.stderr || execution.stdout || "").trim() || `exit ${execution.status ?? "unknown"}`;

  return withFixHint({
    id: item.id,
    label: item.label,
    category: "remote_check",
    required: true,
    status: execution.status === 0 ? "ok" : "failed",
    path: relativeToRepoOrAbsolute(repoPath),
    detail,
  }, { item });
}

function runGitSyncCheck(item, repoPath) {
  const branch = item.branch ?? "main";
  const fetchExecution = spawnSync("git", ["-C", repoPath, "fetch", "--quiet", "origin", branch], {
    cwd: repoRoot,
    encoding: "utf8",
  });

  if (fetchExecution.status !== 0) {
    return withFixHint({
      id: item.id,
      label: item.label,
      category: "remote_check",
      required: true,
      path: relativeToRepoOrAbsolute(repoPath),
      status: "failed",
      detail: String(fetchExecution.stderr || fetchExecution.stdout || "").trim() || `fetch exit ${fetchExecution.status ?? "unknown"}`,
    }, { item });
  }

  const localHead = readGitSingleLine(repoPath, ["rev-parse", "HEAD"]);
  const remoteHead = readGitSingleLine(repoPath, ["rev-parse", `origin/${branch}`]);
  const branchName = readGitSingleLine(repoPath, ["branch", "--show-current"]);
  const counts = readGitSingleLine(repoPath, ["rev-list", "--left-right", "--count", `origin/${branch}...HEAD`]);

  if (!localHead.ok || !remoteHead.ok || !counts.ok) {
    return withFixHint({
      id: item.id,
      label: item.label,
      category: "remote_check",
      required: true,
      path: relativeToRepoOrAbsolute(repoPath),
      status: "failed",
      detail: [localHead.detail, remoteHead.detail, counts.detail].filter(Boolean).join(" | "),
    }, { item });
  }

  const [behindRaw, aheadRaw] = counts.detail.split(/\s+/);
  const behind = Number.parseInt(behindRaw ?? "0", 10);
  const ahead = Number.parseInt(aheadRaw ?? "0", 10);

  return withFixHint({
    id: item.id,
    label: item.label,
    category: "remote_check",
    required: true,
    path: relativeToRepoOrAbsolute(repoPath),
    status: behind > 0 ? "failed" : "ok",
    detail: `branch=${branchName.detail || "(detached)"} local=${localHead.detail.slice(0, 12)} origin/${branch}=${remoteHead.detail.slice(0, 12)} ahead=${ahead} behind=${behind}`,
  }, { item });
}

async function writeStatus(report) {
  await writeJson(statusFilePath, report);
}

function tryParseJson(value) {
  if (!value) {
    return null;
  }
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function relativeToRepoOrAbsolute(filePath) {
  return sharedRelativeToRepoOrAbsolute(repoRoot, filePath);
}

function dedupePreserveOrder(items) {
  const seen = new Set();
  const result = [];
  for (const item of items) {
    if (seen.has(item)) {
      continue;
    }
    seen.add(item);
    result.push(item);
  }
  return result;
}

function resolveProfile(profile, checklist) {
  const supported = checklist.profile_defaults?.supported ?? ["public-only"];
  const selected = profile ?? checklist.profile_defaults?.default ?? "public-only";
  if (!supported.includes(selected)) {
    throw new Error(`unsupported doctor profile: ${selected}`);
  }
  return selected;
}

function resolveMode(options) {
  const parts = ["safe"];
  if (options.remote) {
    parts.push("remote");
  }
  if (options.live) {
    parts.push("live");
  }
  return parts.join("+");
}

function itemAppliesToProfile(item, profile) {
  return !item?.profiles || item.profiles.includes(profile);
}

function resolvePrivateStateRepoRoot(checklist) {
  const item =
    (checklist.profile_local_paths ?? []).find((entry) => entry.id === "private_state_repo_required") ??
    (checklist.optional_local_paths ?? []).find((entry) => entry.id === "private_state_repo");
  if (!item?.path) {
    return null;
  }
  const resolved = path.resolve(repoRoot, item.path);
  return path.basename(resolved) === ".git" ? path.dirname(resolved) : resolved;
}

function readGitSingleLine(repoPath, args) {
  const execution = spawnSync("git", ["-C", repoPath, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  const detail = String(execution.stdout || execution.stderr || "").trim();
  return {
    ok: execution.status === 0,
    detail: detail || `exit ${execution.status ?? "unknown"}`,
  };
}

function withFixHint(result, context = {}) {
  if (result.status === "ok") {
    return result;
  }
  const fixHint = buildFixHint(result, context);
  if (!fixHint) {
    return result;
  }
  return {
    ...result,
    fix_hint: fixHint,
  };
}

function buildFixHint(result, context = {}) {
  const item = context.item ?? {};

  if (result.category === "required_skill") {
    return "sync 가능한 Soulforge Codex skill 을 local 에 materialize 한다. 예: `npm run skills:sync -- --all`";
  }

  if (result.category === "required_codex_runtime_skill") {
    return "필수 local Codex runtime skill 을 복구한다. `conversation-rule-hardening` 은 local skill 이 없으면 `.registry/skills` 로 승격하거나 `~/.codex/skills/` 에 다시 설치한 뒤 doctor 를 다시 실행한다.";
  }

  if (result.category === "required_codex_stop_hook") {
    return "`~/.codex/config.toml` 의 `[[hooks.Stop]]` 설정에 `guild_hall/knowledge_access/knowledge_trigger_stop_guard.mjs` 와 `guild_hall/knowledge_access/rule_hardening_stop_guard.mjs` command 를 둘 다 등록한 뒤 doctor 를 다시 실행한다.";
  }

  switch (result.id) {
    case "local_node_identity":
      return "현재 PC 역할을 `guild_hall/state/local/node_identity.yaml` 에 local-only 로 기록한다. 해당 파일은 `guild_hall/state/**` 아래에 두고 public Git 에 추적하지 않는다.";
    case "git":
      return "Git 을 설치하고 PATH 에 노출한 뒤 `git --version` 으로 다시 확인한다. macOS 예시: `xcode-select --install` 또는 `brew install git`";
    case "gh":
      return "GitHub CLI 를 설치한 뒤 `gh auth login` 을 수행한다. macOS 예시: `brew install gh`";
    case "node":
    case "npm":
      return "Node.js 와 npm 을 설치한 뒤 `node --version`, `npm --version` 을 다시 확인한다. macOS 예시: `brew install node`";
    case "python3":
      return "Python 3 를 설치하고 PATH 에 노출한 뒤 `python3 --version` 으로 다시 확인한다. macOS 예시: `brew install python`";
    case "uv":
      return "uv 를 설치한 뒤 `uv --version` 으로 다시 확인한다. macOS 예시: `brew install uv`";
    case "nlm":
      return "NotebookLM 기능이 필요할 때만 `uv tool install --force notebooklm-mcp-cli` 를 실행한다.";
    case "email_fetch_env":
    case "telegram_notify_env":
    case "gateway_notify_policy":
    case "mail_send_env":
      return buildTemplateCopyHint(item);
    case "private_state_repo":
    case "private_state_repo_required":
      return "owner-with-state 프로필이면 Soulforge root 아래 `private-state/` 로 private state repo 를 clone 한다. 예: `git clone <private-state-repo-url> private-state`";
    case "private_state_gateway_intake_inbox":
      return "연속 작업이 필요하면 private state repo 에서 `guild_hall/state/gateway/intake_inbox/` 를 rsync 로 복원한다.";
    case "private_state_gateway_monster_events":
      return "연속 작업이 필요하면 private state repo 에서 `guild_hall/state/gateway/log/monster_events/` 를 rsync 로 복원한다.";
    case "private_state_gateway_outbound":
      return "연속 작업이 필요하면 private state repo 에서 `guild_hall/state/gateway/mailbox/outbound/` 를 rsync 로 복원한다.";
    case "gateway_cli_syntax":
      return "gateway CLI 변경분을 점검하고 `node --check guild_hall/gateway/cli.mjs` 가 통과하도록 수정한다.";
    case "town_crier_status":
      return "Telegram env 와 town_crier state 경로를 확인한 뒤 `node guild_hall/town_crier/cli.mjs status` 를 다시 실행한다.";
    case "mail_fetch_py_compile":
      return "mail fetch / town_crier Python 파일 문법 오류를 수정한 뒤 `python3 -m py_compile ...` 를 다시 실행한다.";
    case "gh_auth_status":
      return "`gh auth login` 을 수행한 뒤 `gh auth status` 가 통과하는지 다시 확인한다.";
    case "git_public_origin":
      return "public repo 에 `origin` remote 를 다시 연결한다. 예: `git remote add origin <public-repo-url>`";
    case "git_public_sync":
      return "public repo 최신 상태를 맞춘다. 예: `git fetch origin main && git pull --rebase origin main`";
    case "git_private_origin":
      return "private state repo 에 `origin` remote 를 다시 연결한다. 예: `cd private-state && git remote add origin <private-state-repo-url>`";
    case "git_private_sync":
      return "private state repo 최신 상태를 맞춘다. 예: `cd private-state && git fetch origin main && git pull --rebase origin main`";
    case "hiworks_pop3_live":
      return "`guild_hall/state/gateway/mailbox/state/email_fetch.env` 의 Hiworks POP3 값을 점검한 뒤 `npm run guild-hall:doctor -- --live` 를 다시 실행한다.";
    case "hiworks_smtp_live":
      return "`guild_hall/state/gateway/mailbox/state/mail_send.env` 의 Hiworks SMTP 값을 점검한 뒤 `npm run guild-hall:doctor -- --live` 를 다시 실행한다.";
    case "telegram_live":
      return "`guild_hall/state/town_crier/telegram_notify.env` 의 bot token/chat id 를 점검한 뒤 `npm run guild-hall:doctor -- --live` 를 다시 실행한다.";
    default:
      return null;
  }
}

function buildTemplateCopyHint(item) {
  if (!item?.path) {
    return null;
  }
  if (item.template) {
    return `템플릿을 복사해 local 파일을 만든다. 예: \`cp ${item.template} ${item.path}\` 후 실제 값을 채운다.`;
  }
  return `local 파일을 만든 뒤 필요한 실제 값을 채운다: ${item.path}`;
}

main().catch((error) => {
  const args = parseArgs(process.argv.slice(2));
  const detail = error instanceof Error ? error.message : String(error);
  const payload = buildDoctorFatalPayload({
    doctorSchemaVersion,
    profile: args.profile ?? "public-only",
    mode: resolveMode({ live: Boolean(args.live), remote: Boolean(args.remote) }),
    repoRoot,
    statusFile: relativeToRepo(repoRoot, statusFilePath),
    checklistFile: relativeToRepo(repoRoot, checklistPath),
    detail,
  });

  if (args.json) {
    printDoctorJson(payload);
  } else {
    process.stderr.write(`Soulforge Bootstrap Doctor fatal: ${detail}\n`);
  }

  process.exitCode = 2;
});

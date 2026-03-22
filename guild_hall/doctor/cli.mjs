#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");
const checklistPath = path.join(repoRoot, "docs", "architecture", "bootstrap", "BOOTSTRAP_CHECKLIST_V0.json");
const statusFilePath = path.join(repoRoot, "guild_hall", "state", "doctor", "status.json");
const doctorSchemaVersion = "bootstrap.doctor.v0";

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
    printJson(report);
  } else {
    printHuman(report);
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

  for (const item of checklist.required_tools ?? []) {
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
    const result = withFixHint(runCommandCheck({
      id: item.id,
      label: item.label,
      category: "optional_tool",
      command: item.command,
      required: false,
    }), { item });
    results.push(result);
  }

  for (const skillName of checklist.optional_skills ?? []) {
    const skillPath = path.join(resolveCodexHome(), "skills", skillName, "SKILL.md");
    const exists = await pathExists(skillPath);
    results.push(withFixHint({
      id: `skill_${skillName}`,
      label: skillName,
      category: "optional_skill",
      required: false,
      status: exists ? "ok" : "missing",
      path: relativeToRepoOrAbsolute(skillPath),
      detail: exists ? "installed" : "missing",
    }, { item: { id: `skill_${skillName}` } }));
  }

  for (const item of checklist.required_local_files ?? []) {
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
    const targetPath = path.resolve(repoRoot, item.path);
    const exists = await pathExists(targetPath);
    results.push(withFixHint({
      id: item.id,
      label: item.label,
      category: "optional_local_path",
      required: false,
      status: exists ? "ok" : "missing",
      path: relativeToRepoOrAbsolute(targetPath),
      detail: exists ? "present" : item.note ?? "missing",
    }, { item }));
  }

  for (const item of checklist.profile_local_paths ?? []) {
    if (!item.profiles?.includes(profile)) {
      continue;
    }

    const targetPath = path.resolve(repoRoot, item.path);
    const exists = await pathExists(targetPath);
    const required = Boolean(item.required);
    const result = withFixHint({
      id: item.id,
      label: item.label,
      category: "profile_local_path",
      required,
      status: exists ? "ok" : "missing",
      path: relativeToRepoOrAbsolute(targetPath),
      detail: exists ? "present" : item.note ?? "missing",
    }, { item, profile });
    results.push(result);

    if (!exists && required) {
      nextSteps.push(result.fix_hint ?? `profile ${profile} 준비: ${item.path}`);
    }
  }

  for (const item of checklist.safe_smokes ?? []) {
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
    liveSmokeResults = runLiveChecks(checklist.live_smokes ?? []);
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
  const safeSmokeResults = results.filter((item) => item.category === "safe_smoke");
  const safeSmokesPassed = safeSmokeResults.filter((item) => item.status === "ok").length;
  const remoteChecksPassed = remoteCheckResults.filter((item) => item.status === "ok").length;
  const liveSmokesPassed = liveSmokeResults.filter((item) => item.status === "ok").length;
  const ready = requiredResults.every((item) => item.status === "ok");

  for (const item of checklist.live_followups ?? []) {
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
      profile_checks_passed: profilePassed,
      profile_checks_total: profileResults.length,
      safe_smokes_passed: safeSmokesPassed,
      safe_smokes_total: safeSmokeResults.length,
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

function runCommandCheck({ id, label, category, command, required }) {
  const execution = spawnSync(command[0], command.slice(1), {
    cwd: repoRoot,
    encoding: "utf8",
  });

  if (execution.error?.code === "ENOENT") {
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

function runLiveChecks(checklistItems) {
  const execution = spawnSync("python3", ["guild_hall/doctor/live_checks.py", "--json"], {
    cwd: repoRoot,
    encoding: "utf8",
  });

  if (execution.error?.code === "ENOENT") {
    return buildLiveFallbackResults(checklistItems, "command not found: python3");
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
  await fs.mkdir(path.dirname(statusFilePath), { recursive: true });
  await fs.writeFile(statusFilePath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

function printHuman(report) {
  const lines = [
    "Soulforge Bootstrap Doctor",
    `profile: ${report.profile}`,
    `mode: ${report.mode}`,
    `ready: ${report.ready ? "yes" : "no"}`,
    `required: ${report.summary.required_passed}/${report.summary.required_total}`,
    `profile_checks: ${report.summary.profile_checks_passed}/${report.summary.profile_checks_total}`,
    `safe_smokes: ${report.summary.safe_smokes_passed}/${report.summary.safe_smokes_total}`,
    `remote_checks: ${report.summary.remote_checks_passed}/${report.summary.remote_checks_total}`,
    `live_smokes: ${report.summary.live_smokes_passed}/${report.summary.live_smokes_total}`,
    `status_file: ${report.status_file}`,
    "",
    "Checks:",
  ];

  for (const item of report.results) {
    const target = item.path ?? (Array.isArray(item.command) ? item.command.join(" ") : item.label);
    lines.push(`- [${item.status}] ${item.id}: ${target}`);
    if (item.detail) {
      lines.push(`  ${item.detail}`);
    }
    if (item.fix_hint) {
      lines.push(`  fix_hint: ${item.fix_hint}`);
    }
  }

  if (report.next_steps.length > 0) {
    lines.push("");
    lines.push("Next steps:");
    report.next_steps.forEach((step, index) => {
      lines.push(`${index + 1}. ${step}`);
    });
  }

  process.stdout.write(`${lines.join("\n")}\n`);
}

function printJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
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

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

function resolveCodexHome() {
  return process.env.CODEX_HOME || path.join(os.homedir(), ".codex");
}

function relativeToRepo(repoRootValue, filePath) {
  return normalizeRepoPath(path.relative(repoRootValue, filePath));
}

function relativeToRepoOrAbsolute(filePath) {
  const relative = path.relative(repoRoot, filePath);
  if (!relative || !relative.startsWith("..")) {
    return normalizeRepoPath(relative || ".");
  }
  return filePath;
}

function normalizeRepoPath(value) {
  return value.split(path.sep).join("/");
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

  switch (result.id) {
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
    case "private_state_workspace_root":
      return "연속 작업이 필요하면 private state repo 에서 `_workspaces/` 를 필요한 project 범위만 rsync 로 복원한다.";
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
  const payload = {
    schema_version: doctorSchemaVersion,
    doctor_version: "v0",
    checklist_version: "unknown",
    profile: args.profile ?? "public-only",
    mode: resolveMode({ live: Boolean(args.live), remote: Boolean(args.remote) }),
    generated_at: new Date().toISOString(),
    repo_root: repoRoot,
    ready: false,
    summary: {
      required_passed: 0,
      required_total: 0,
      profile_checks_passed: 0,
      profile_checks_total: 0,
      safe_smokes_passed: 0,
      safe_smokes_total: 0,
      remote_checks_passed: 0,
      remote_checks_total: 0,
      live_smokes_passed: 0,
      live_smokes_total: 0,
    },
    status_file: relativeToRepo(repoRoot, statusFilePath),
    checklist_file: relativeToRepo(repoRoot, checklistPath),
    results: [
      {
        id: "fatal_internal_error",
        label: "bootstrap doctor fatal error",
        category: "doctor_fatal",
        required: true,
        status: "failed",
        detail,
      },
    ],
    next_steps: [
      "doctor fatal 원인을 확인하고 bootstrap checklist/경로 구성을 다시 점검한다.",
    ],
    fatal: true,
    detail,
  };

  if (args.json) {
    printJson(payload);
  } else {
    process.stderr.write(`Soulforge Bootstrap Doctor fatal: ${detail}\n`);
  }

  process.exitCode = 2;
});

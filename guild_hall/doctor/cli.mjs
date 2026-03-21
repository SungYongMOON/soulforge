#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");
const checklistPath = path.join(repoRoot, "docs", "architecture", "bootstrap", "BOOTSTRAP_CHECKLIST_V0.json");
const statusFilePath = path.join(repoRoot, "guild_hall", "state", "doctor", "status.json");

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const checklist = JSON.parse(await fs.readFile(checklistPath, "utf8"));
  const report = await runDoctor(checklist, { live: Boolean(args.live) });
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

  for (const item of checklist.required_tools ?? []) {
    const result = runCommandCheck({
      id: item.id,
      label: item.label,
      category: "required_tool",
      command: item.command,
      required: true,
    });
    results.push(result);
    toolAvailability.set(item.command[0], result.status === "ok");
    if (result.status !== "ok") {
      nextSteps.push(`필수 도구 설치: ${item.label}`);
    }
  }

  for (const item of checklist.optional_tools ?? []) {
    const result = runCommandCheck({
      id: item.id,
      label: item.label,
      category: "optional_tool",
      command: item.command,
      required: false,
    });
    results.push(result);
  }

  for (const skillName of checklist.optional_skills ?? []) {
    const skillPath = path.join(resolveCodexHome(), "skills", skillName, "SKILL.md");
    const exists = await pathExists(skillPath);
    results.push({
      id: `skill_${skillName}`,
      label: skillName,
      category: "optional_skill",
      required: false,
      status: exists ? "ok" : "missing",
      path: relativeToRepoOrAbsolute(skillPath),
      detail: exists ? "installed" : "missing",
    });
  }

  for (const item of checklist.required_local_files ?? []) {
    const filePath = path.join(repoRoot, item.path);
    const exists = await pathExists(filePath);
    results.push({
      id: item.id,
      label: item.label,
      category: "required_local_file",
      required: true,
      status: exists ? "ok" : "missing",
      path: item.path,
      template: item.template ?? null,
      detail: exists ? "present" : "missing",
    });
    if (!exists) {
      if (item.template) {
        nextSteps.push(`local 파일 생성: ${item.path} <= ${item.template}`);
      } else {
        nextSteps.push(`local 파일 생성: ${item.path}`);
      }
    }
  }

  for (const item of checklist.optional_local_paths ?? []) {
    const targetPath = path.resolve(repoRoot, item.path);
    const exists = await pathExists(targetPath);
    results.push({
      id: item.id,
      label: item.label,
      category: "optional_local_path",
      required: false,
      status: exists ? "ok" : "missing",
      path: relativeToRepoOrAbsolute(targetPath),
      detail: exists ? "present" : item.note ?? "missing",
    });
  }

  for (const item of checklist.safe_smokes ?? []) {
    const executable = item.command[0];
    if (!toolAvailability.get(executable)) {
      results.push({
        id: item.id,
        label: item.label,
        category: "safe_smoke",
        required: true,
        status: "blocked",
        command: item.command,
        detail: `missing required tool: ${executable}`,
      });
      nextSteps.push(`필수 도구 설치 후 다시 실행: ${item.label}`);
      continue;
    }

    const result = runCommandCheck({
      id: item.id,
      label: item.label,
      category: "safe_smoke",
      command: item.command,
      required: true,
    });
    results.push(result);
    if (result.status !== "ok") {
      nextSteps.push(`safe smoke 확인: ${item.label}`);
    }
  }

  const requiredResults = results.filter((item) => item.required);
  const requiredPassed = requiredResults.filter((item) => item.status === "ok").length;
  const safeSmokeResults = results.filter((item) => item.category === "safe_smoke");
  const safeSmokesPassed = safeSmokeResults.filter((item) => item.status === "ok").length;
  let liveSmokeResults = [];

  if (options.live) {
    const liveResult = runCommandCheck({
      id: "live_checks",
      label: "live external checks",
      category: "live_smoke",
      command: ["python3", "guild_hall/doctor/live_checks.py", "--json"],
      required: true,
    });
    results.push(liveResult);
    liveSmokeResults = [liveResult];
    if (liveResult.status !== "ok") {
      nextSteps.push("live 외부 인증/연결 상태를 확인한다.");
    }
  } else {
    nextSteps.push("live 외부 점검이 필요하면: npm run guild-hall:doctor -- --live");
  }

  const liveSmokesPassed = liveSmokeResults.filter((item) => item.status === "ok").length;
  const ready = requiredResults.every((item) => item.status === "ok") && liveSmokeResults.every((item) => item.status === "ok");

  for (const item of checklist.live_followups ?? []) {
    nextSteps.push(`live check 준비: ${item.command}`);
  }

  return {
    doctor_version: checklist.version ?? "v0",
    mode: options.live ? "safe+live" : "safe",
    generated_at: new Date().toISOString(),
    repo_root: repoRoot,
    ready,
    summary: {
      required_passed: requiredPassed,
      required_total: requiredResults.length,
      safe_smokes_passed: safeSmokesPassed,
      safe_smokes_total: safeSmokeResults.length,
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

async function writeStatus(report) {
  await fs.mkdir(path.dirname(statusFilePath), { recursive: true });
  await fs.writeFile(statusFilePath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

function printHuman(report) {
  const lines = [
    "Soulforge Bootstrap Doctor",
    `mode: ${report.mode}`,
    `ready: ${report.ready ? "yes" : "no"}`,
    `required: ${report.summary.required_passed}/${report.summary.required_total}`,
    `safe_smokes: ${report.summary.safe_smokes_passed}/${report.summary.safe_smokes_total}`,
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

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});

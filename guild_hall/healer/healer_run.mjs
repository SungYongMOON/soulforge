import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  appendActivityEvent,
  buildDateStamps,
  defaultActivityRoot,
  loadNodeIdentity,
  sanitizeActivityValue,
} from "../activity/activity_log.mjs";
import { normalizeRepoPath, relativeToRepo, writeJson } from "../shared/io.mjs";
import { enqueueNotification } from "../town_crier/runtime.mjs";
import { runAlwaysOnChecks } from "./always_on_checks.mjs";

export const HEALER_AUTOMATION_ID = "soulforge-healer-run";

export async function runHealerOnce(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const activityRoot = path.resolve(options.activityRoot ?? defaultActivityRoot(repoRoot));
  const now = options.now instanceof Date ? options.now : new Date();
  const identity = options.identity ?? (await loadNodeIdentity(repoRoot));
  const runCommand = options.runCommand ?? defaultRunCommand;
  const alwaysOnCheckRunner = options.alwaysOnCheckRunner ?? runAlwaysOnChecks;
  const checks = [];

  checks.push(
    await runCheck({
      id: "git_status",
      command: "git",
      args: ["status", "--short", "--branch"],
      cwd: repoRoot,
      runCommand,
    }),
  );

  if (options.skipValidate) {
    checks.push(skippedCheck("root_validate", "skipped by --skip-validate"));
  } else {
    checks.push(
      await runCheck({
        id: "root_validate",
        command: "npm",
        args: ["run", "validate"],
        cwd: repoRoot,
        runCommand,
      }),
    );
  }

  if (options.skipGatewayHealthcheck) {
    checks.push(skippedCheck("gateway_fetch_healthcheck", "skipped by --skip-gateway-healthcheck"));
  } else {
    checks.push(
      await runCheck({
        id: "gateway_fetch_healthcheck",
        command: "npm",
        args: ["run", "guild-hall:gateway:fetch:healthcheck", "--", "--json"],
        cwd: repoRoot,
        runCommand,
        assess: assessGatewayHealthcheck,
      }),
    );
  }

  if (options.skipAlwaysOnChecks) {
    checks.push(skippedCheck("always_on_checks", "skipped by --skip-always-on-checks"));
  } else {
    const alwaysOnChecks = await alwaysOnCheckRunner({
      repoRoot,
      activityRoot,
      runCommand,
      mapPath: path.join(activityRoot, "latest_context.json"),
      latestContextPath: path.join(activityRoot, "latest_context.json"),
      reportLogRoot: path.join(activityRoot, "log"),
      ...(options.alwaysOnCheckOptions ?? {}),
    });
    checks.push(...alwaysOnChecks);
  }

  const failedChecks = checks.filter((check) => check.status === "failed");
  const warningChecks = checks.filter((check) => check.status === "warn");
  const result = failedChecks.length > 0 ? "failed" : "completed";
  const summary = buildSummary(result, checks);
  const nextAction =
    result !== "completed"
      ? `실패한 점검을 확인하세요: ${failedChecks.map((check) => check.id).join(", ")}.`
      : warningChecks.length > 0
        ? `경고 상태 점검을 확인하세요: ${warningChecks.map((check) => check.id).join(", ")}.`
        : "예약된 gateway/night_watch 작업을 계속 진행하고 latest_context.json을 인계 표면으로 사용하세요.";
  const carryForward = result !== "completed" || warningChecks.length > 0;
  const report = await writeHealerReport({
    repoRoot,
    activityRoot,
    now,
    identity,
    result,
    summary,
    nextAction,
    carryForward,
    checks,
  });
  const notification =
    result === "failed" && options.notifyOnFailure === true
      ? await enqueueHealerFailureNotification({
          repoRoot,
          failedChecks,
          summary,
          reportRef: report.report_ref,
        })
      : null;
  const activity = await appendActivityEvent({
    repoRoot,
    activityRoot,
    now,
    identity,
    input: {
      scope: "healer",
      project_code: "shared",
      action: "healer_run",
      result,
      summary,
      refs: [report.report_ref],
      detail_owner: "guild_hall/healer + guild_hall/state/operations/soulforge_activity",
      next_action: nextAction,
      carry_forward: carryForward,
    },
  });
  const runSummary = {
    automation_id: HEALER_AUTOMATION_ID,
    run_at: now.toISOString(),
    result,
    node_id: identity.node_id,
    node_role: identity.node_role,
    checks,
    notification,
    files: {
      report_path: report.report_path,
      report_ref: report.report_ref,
      summary_path: report.summary_path,
      activity_events_path: activity.events_path,
      latest_context_path: activity.latest_context_path,
    },
  };

  await writeJson(report.summary_path, runSummary);
  return runSummary;
}

async function runCheck({ id, command, args, cwd, runCommand, assess }) {
  const startedAt = new Date();
  const result = await runCommand({ command, args, cwd });
  const endedAt = new Date();
  const output = sanitizeCommandOutput(`${result.stdout ?? ""}\n${result.stderr ?? ""}`);
  const assessment = typeof assess === "function" ? assess(result, output) : null;
  const status = assessment?.status ?? (result.status === 0 ? "passed" : "failed");
  const summary = assessment?.summary ?? summarizeOutput(output);

  return {
    id,
    command: [command, ...args].join(" "),
    status,
    exit_code: result.status ?? null,
    started_at: startedAt.toISOString(),
    ended_at: endedAt.toISOString(),
    duration_ms: Math.max(0, endedAt.getTime() - startedAt.getTime()),
    summary,
    output_tail: output,
  };
}

function skippedCheck(id, detail) {
  const now = new Date().toISOString();
  return {
    id,
    command: null,
    status: "skipped",
    exit_code: null,
    started_at: now,
    ended_at: now,
    duration_ms: 0,
    summary: detail,
    output_tail: "",
  };
}

async function defaultRunCommand({ command, args, cwd }) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    shell: false,
  });

  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

async function writeHealerReport({ repoRoot, activityRoot, now, identity, result, summary, nextAction, carryForward, checks }) {
  const stamps = buildDateStamps(now);
  const logDir = path.join(activityRoot, "log", stamps.year, stamps.date);
  const reportPath = path.join(logDir, `${stamps.timeSecond}-healer-run.md`);
  const summaryPath = path.join(logDir, `${stamps.timeSecond}-healer-run.summary.json`);
  const reportRef = relativeToRepo(repoRoot, reportPath);
  const lines = [
    "# Soulforge Healer Run",
    "",
    `- automation_id: ${HEALER_AUTOMATION_ID}`,
    `- run_at: ${now.toISOString()}`,
    `- status: ${result}`,
    `- node_id: ${identity.node_id}`,
    `- node_role: ${identity.node_role}`,
    "",
    "## Summary",
    "",
    summary,
    "",
    "## Checks",
    "",
  ];

  for (const check of checks) {
    lines.push(`### ${check.id}`);
    lines.push(`- command: ${check.command ?? "(skipped)"}`);
    if (check.source) {
      lines.push(`- source: ${check.source}`);
    }
    lines.push(`- status: ${check.status}`);
    lines.push(`- exit_code: ${check.exit_code ?? "(none)"}`);
    lines.push(`- duration_ms: ${check.duration_ms}`);
    lines.push(`- summary: ${check.summary || "(no output)"}`);
    if (check.output_tail) {
      lines.push("");
      lines.push("```text");
      lines.push(check.output_tail);
      lines.push("```");
    }
    lines.push("");
  }

  lines.push("## Next Action");
  lines.push("");
  lines.push(nextAction);
  lines.push("");
  lines.push("## Carry Forward");
  lines.push("");
  lines.push(`- carry_forward: ${carryForward ? "true" : "false"}`);
  lines.push("");
  lines.push("## Refs");
  lines.push("");
  lines.push(`- ${normalizeRepoPath(reportRef)}`);

  await fs.mkdir(logDir, { recursive: true });
  await fs.writeFile(reportPath, `${lines.join("\n")}\n`, "utf8");

  return {
    report_path: reportPath,
    report_ref: normalizeRepoPath(reportRef),
    summary_path: summaryPath,
  };
}

function buildSummary(result, checks) {
  const passedCount = checks.filter((check) => check.status === "passed").length;
  const warningCount = checks.filter((check) => check.status === "warn").length;
  const skippedCount = checks.filter((check) => check.status === "skipped").length;

  if (result === "completed") {
    return `healer 실행 완료: 통과 ${passedCount}건, 경고 ${warningCount}건, 건너뜀 ${skippedCount}건.`;
  }

  const failed = checks.filter((check) => check.status === "failed").map((check) => check.id).join(", ");
  return `healer 실행 실패: 실패 점검 ${failed}; 경고 ${warningCount}건, 건너뜀 ${skippedCount}건.`;
}

async function enqueueHealerFailureNotification({ repoRoot, failedChecks, summary, reportRef }) {
  const failedIds = failedChecks.map((check) => check.id).join(", ");
  const text = [
    `healer 실패: ${failedIds}`,
    summary,
    `보고서: ${reportRef}`,
  ].join("\n");

  try {
    return await enqueueNotification(repoRoot, {
      owner_scope: "healer",
      event: "healer_failed",
      text,
      source_ref: reportRef,
      mission_ref: null,
    });
  } catch (error) {
    return {
      ok: false,
      status: "queue_failed",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function sanitizeCommandOutput(value) {
  const text = sanitizeActivityValue(value, "command_output", 2000) ?? "";
  return String(text)
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .slice(-30)
    .join("\n");
}

function summarizeOutput(value) {
  const lines = value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0) {
    return "ok";
  }
  return lines[lines.length - 1].slice(0, 240);
}

function assessGatewayHealthcheck(result, output) {
  if (result.status !== 0) {
    return null;
  }

  const payload = parseJsonObjectFromOutput(output);
  if (!payload) {
    return {
      status: "failed",
      summary: "gateway healthcheck 출력이 올바른 JSON이 아닙니다",
    };
  }

  const healthStatus = String(payload.status ?? "").trim().toUpperCase();
  const reason = String(payload.reason ?? "").trim();
  if (healthStatus === "WARN" || healthStatus === "CRITICAL") {
    return {
      status: "failed",
      summary: `gateway healthcheck 상태 ${healthStatus}${reason ? `: ${reason}` : ""}`,
    };
  }

  if (healthStatus === "NORMAL") {
    return {
      status: "passed",
      summary: `gateway healthcheck 정상${reason ? `: ${reason}` : ""}`,
    };
  }

  return {
    status: "failed",
    summary: "gateway healthcheck JSON에 인식 가능한 상태가 없습니다",
  };
}

function parseJsonObjectFromOutput(output) {
  const text = String(output ?? "").trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    return null;
  }

  try {
    const parsed = JSON.parse(text.slice(start, end + 1));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

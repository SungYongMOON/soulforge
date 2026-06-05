import { promises as fs } from "node:fs";
import path from "node:path";

import { readDeadlineRegisterRows } from "./deadline_watch_import.mjs";
import {
  pathExists,
  relativeToRepo,
  writeJson,
} from "../shared/io.mjs";

export const DEADLINE_WATCHDOG_REMINDER_SCHEMA_VERSION = "soulforge.gateway.deadline_watchdog_reminder.v0";

const DEFAULT_DUE_WINDOW_HOURS = 72;
const DEFAULT_COOLDOWN_HOURS = 24;
const DEFAULT_MAX_NUDGE_COUNT = 3;
const ACTIVE_STATUSES = new Set(["open", "waiting", "sent", "snoozed"]);
const TERMINAL_OR_HELD_STATUSES = new Set(["done", "cancelled", "superseded", "blocked"]);

export function defaultDeadlineWatchdogPreviewLatestFile(repoRoot) {
  return path.join(
    repoRoot,
    "_workmeta",
    "system",
    "reports",
    "assistant_operating_roadmap",
    "deadline_watchdog_reminder_preview_latest.json",
  );
}

export async function refreshDeadlineWatchdogReminderPreview(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const outputFile = options.outputFile ? path.resolve(options.outputFile) : null;
  const preview = await buildDeadlineWatchdogReminderPreview({
    ...options,
    repoRoot,
  });

  if (outputFile) {
    assertPreviewOutputPath({ repoRoot, outputFile });
    await writeJson(outputFile, preview);
  }

  return {
    ...preview,
    output_ref: outputFile ? relativeToRepo(repoRoot, outputFile) : null,
  };
}

export async function buildDeadlineWatchdogReminderPreview(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const workmetaRoot = path.resolve(options.workmetaRoot ?? path.join(repoRoot, "_workmeta"));
  const now = normalizeDate(options.now ?? new Date()) ?? new Date();
  const dueWindowHours = positiveNumber(options.dueWindowHours, DEFAULT_DUE_WINDOW_HOURS);
  const cooldownHours = positiveNumber(options.cooldownHours, DEFAULT_COOLDOWN_HOURS);
  const maxNudgeCount = Math.max(0, Math.floor(positiveNumber(options.maxNudgeCount, DEFAULT_MAX_NUDGE_COUNT)));
  const registers = await collectDeadlineRegisters({ repoRoot, workmetaRoot });
  const reminderCandidates = [];
  const suppressed = [];

  for (const register of registers) {
    for (const row of register.rows) {
      const decision = evaluateDeadlineRow({
        row,
        register,
        now,
        dueWindowHours,
        cooldownHours,
        maxNudgeCount,
      });
      if (decision.candidate) {
        reminderCandidates.push(decision.candidate);
      } else {
        suppressed.push(decision.suppressed);
      }
    }
  }

  reminderCandidates.sort(compareReminderCandidates);

  return {
    schema_version: DEADLINE_WATCHDOG_REMINDER_SCHEMA_VERSION,
    kind: "deadline_watchdog_reminder_preview",
    status: "dry_run",
    generated_at: now.toISOString(),
    workmeta_root: relativeToRepo(repoRoot, workmetaRoot),
    register_count: registers.length,
    deadline_row_count: registers.reduce((count, register) => count + register.rows.length, 0),
    reminder_candidate_count: reminderCandidates.length,
    suppressed_count: suppressed.length,
    due_window_hours: dueWindowHours,
    cooldown_hours: cooldownHours,
    max_nudge_count: maxNudgeCount,
    project_counts: countBy(reminderCandidates, "project_code"),
    suppressed_reason_counts: countBy(suppressed, "reason"),
    reminder_candidates: reminderCandidates,
    suppressed: suppressed.slice(0, 100),
    boundary: {
      dry_run_only: true,
      manual_confirm_required: true,
      town_crier_queue_written: false,
      telegram_sent: false,
      raw_payload_copied: false,
      raw_mail_body_read: false,
      raw_html_read: false,
      attachment_payload_read: false,
      secret_value_read: false,
    },
  };
}

async function collectDeadlineRegisters({ repoRoot, workmetaRoot }) {
  if (!(await pathExists(workmetaRoot))) {
    return [];
  }

  const registers = [];
  const entries = await fs.readdir(workmetaRoot, { withFileTypes: true });
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (!entry.isDirectory()) {
      continue;
    }

    const projectCode = entry.name;
    const registerFile = path.join(workmetaRoot, projectCode, "reports", "deadline_watch", "deadline_register.csv");
    if (!(await pathExists(registerFile))) {
      continue;
    }

    const rows = await readDeadlineRegisterRows(registerFile);
    registers.push({
      project_code: projectCode,
      register_file: registerFile,
      register_ref: relativeToRepo(repoRoot, registerFile),
      rows,
    });
  }

  return registers;
}

function evaluateDeadlineRow({
  row,
  register,
  now,
  dueWindowHours,
  cooldownHours,
  maxNudgeCount,
}) {
  const deadlineId = safeId(row.deadline_id);
  const rowRef = `${register.register_ref}#deadline_id=${deadlineId || "missing"}`;
  const projectCode = String(row.project_code || register.project_code);
  const status = String(row.status ?? "");
  const dueAt = normalizeDate(row.due_at);
  const nextNudgeAt = normalizeDate(row.next_nudge_at);
  const lastNudgedAt = normalizeDate(row.last_nudged_at);
  const snoozeUntil = normalizeDate(row.snooze_until);
  const nudgeCount = parseInteger(row.nudge_count);

  if (row.raw_payload_copied !== "false") {
    return suppress(rowRef, projectCode, "raw_payload_boundary_failed");
  }
  if (!deadlineId) {
    return suppress(rowRef, projectCode, "missing_deadline_id");
  }
  if (row.project_code !== register.project_code) {
    return suppress(rowRef, projectCode, "project_folder_mismatch");
  }
  if (TERMINAL_OR_HELD_STATUSES.has(status)) {
    return suppress(rowRef, projectCode, `inactive_status:${status || "missing"}`);
  }
  if (!ACTIVE_STATUSES.has(status)) {
    return suppress(rowRef, projectCode, `unsupported_status:${status || "missing"}`);
  }
  if (!dueAt) {
    return suppress(rowRef, projectCode, "missing_or_invalid_due_at");
  }
  if (status === "snoozed" && snoozeUntil && snoozeUntil.getTime() > now.getTime()) {
    return suppress(rowRef, projectCode, "snoozed_until_future");
  }
  if (nextNudgeAt && nextNudgeAt.getTime() > now.getTime()) {
    return suppress(rowRef, projectCode, "next_nudge_in_future");
  }
  if (lastNudgedAt && hoursBetween(lastNudgedAt, now) < cooldownHours) {
    return suppress(rowRef, projectCode, "cooldown_active");
  }
  if (nudgeCount >= maxNudgeCount) {
    return suppress(rowRef, projectCode, "max_nudge_count_reached");
  }

  const hoursUntilDue = Math.round(((dueAt.getTime() - now.getTime()) / (60 * 60 * 1000)) * 10) / 10;
  if (hoursUntilDue > dueWindowHours) {
    return suppress(rowRef, projectCode, "outside_due_window");
  }

  const dueState = hoursUntilDue < 0 ? "overdue" : "due_soon";
  const candidate = {
    request_id: `deadline_watchdog_${deadlineId}`,
    request_kind: "manual_confirm_telegram_brief_candidate",
    project_code: projectCode,
    deadline_id: deadlineId,
    deadline_ref: rowRef,
    source_kind: safeText(row.source_kind, 40),
    source_ref: safeText(row.source_ref, 240),
    action_type: safeText(row.action_type, 40),
    status,
    due_at: safeText(row.due_at, 80),
    due_text: safeText(row.due_text, 120),
    due_state: dueState,
    hours_until_due: hoursUntilDue,
    nudge_count: nudgeCount,
    manual_confirm_required: true,
    auto_send_allowed: false,
    town_crier_queue_written: false,
    telegram_sent: false,
    text: renderReminderText({
      projectCode,
      row,
      dueState,
      hoursUntilDue,
    }),
  };

  return { candidate, suppressed: null };
}

function renderReminderText({ projectCode, row, dueState, hoursUntilDue }) {
  const action = actionTypeKo(row.action_type);
  const title = safeText(row.subject_hint, 80) || "제목 없는 마감";
  const dueLabel = safeText(row.due_text, 60) || safeText(row.due_at, 60) || "기한 미정";
  const urgency = dueState === "overdue"
    ? `이미 ${Math.abs(hoursUntilDue).toFixed(1)}시간 지났습니다.`
    : `${hoursUntilDue.toFixed(1)}시간 남았습니다.`;

  return [
    "마감 확인이 필요합니다.",
    `프로젝트: ${projectCode}`,
    `할 일: ${action}`,
    `기한: ${dueLabel} (${urgency})`,
    `항목: ${title}`,
    "다음 행동: 완료, 보류, 취소, 스누즈 중 하나로 deadline_watch를 갱신해 주세요.",
  ].join("\n");
}

function actionTypeKo(value) {
  const text = String(value ?? "");
  if (text === "reply_due") return "회신";
  if (text === "submit_due") return "제출";
  if (text === "review_due") return "검토";
  if (text === "meeting") return "회의";
  if (text === "confirm") return "확인";
  if (text === "delivery") return "납품";
  return "후속 조치";
}

function suppress(deadlineRef, projectCode, reason) {
  return {
    candidate: null,
    suppressed: {
      project_code: projectCode,
      deadline_ref: deadlineRef,
      reason,
    },
  };
}

function assertPreviewOutputPath({ repoRoot, outputFile }) {
  const allowedRoot = path.join(repoRoot, "_workmeta", "system", "reports", "assistant_operating_roadmap");
  const relative = path.relative(allowedRoot, outputFile);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("deadline watchdog preview output must stay under _workmeta/system/reports/assistant_operating_roadmap");
  }
}

function normalizeDate(value) {
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return value;
  }
  const text = String(value ?? "").trim();
  if (!text) {
    return null;
  }
  const parsed = new Date(text);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function parseInteger(value) {
  const parsed = Number.parseInt(String(value ?? "0"), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function positiveNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function hoursBetween(start, end) {
  return (end.getTime() - start.getTime()) / (60 * 60 * 1000);
}

function safeText(value, limit) {
  const text = String(value ?? "")
    .replace(/\b(body_text|body_html|provider_payload|local_path|provider_attachment_id|password|cookie|secret|token|attachment_url|download_url)\b/giu, "[redacted]")
    .replace(/\s+/gu, " ")
    .trim();
  return text.length <= limit ? text : `${text.slice(0, Math.max(0, limit - 3))}...`;
}

function safeId(value) {
  return String(value ?? "")
    .trim()
    .replace(/[^A-Za-z0-9_.:@/-]/gu, "_")
    .replace(/_+/gu, "_")
    .replace(/^_+|_+$/gu, "");
}

function countBy(rows, field) {
  const counts = {};
  for (const row of rows) {
    const key = String(row?.[field] ?? "unknown");
    counts[key] = Number(counts[key] ?? 0) + 1;
  }
  return counts;
}

function compareReminderCandidates(left, right) {
  return (
    String(left.due_at).localeCompare(String(right.due_at)) ||
    String(left.project_code).localeCompare(String(right.project_code)) ||
    String(left.deadline_id).localeCompare(String(right.deadline_id))
  );
}

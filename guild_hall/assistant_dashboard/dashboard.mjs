import { promises as fs } from "node:fs";
import path from "node:path";

import {
  pathExists,
  readJson,
  relativeToRepo,
  writeJson,
} from "../shared/io.mjs";
import {
  DEADLINE_REGISTER_HEADERS,
  validateDeadlineWatchLedgers,
} from "../gateway/deadline_watch_import.mjs";
import { validateSnapshot } from "../snapshot/producer.mjs";

export const ASSISTANT_DASHBOARD_SCHEMA_VERSION = "soulforge.assistant_dashboard.v0";

const ASSISTANT_DASHBOARD_OUTPUT_REF = "guild_hall/state/assistant_dashboard/latest.json";
const ACTIVE_DEADLINE_STATUSES = new Set(["open", "waiting", "blocked", "snoozed"]);
const ACTIVE_WORK_STATUSES = new Set(["open", "waiting", "todo", "in_progress", "blocked"]);
const DONE_WORK_STATUSES = new Set(["done", "completed", "closed"]);
const BANNED_PAYLOAD_MARKER = /body_text|body_html|provider_payload|local_path|provider_attachment_id|password|cookie|secret|token|credential|credentials|api_key|authorization|bearer|session_id|session_cookie|session_token|session_secret|attachment_url|download_url/iu;
const AI_DATA_HEALTH_STATUSES = new Set(["fresh", "stale", "missing", "invalid"]);
const AI_DATA_HEALTH_ROW_KEYS = new Set([
  "id",
  "source_ref",
  "status",
  "generated_at",
  "age_hours",
  "max_age_hours",
  "error_count",
  "reason",
]);

export function defaultAssistantDashboardPath(repoRoot) {
  return path.join(repoRoot, ASSISTANT_DASHBOARD_OUTPUT_REF);
}

export function resolveAssistantDashboardOutputPath(repoRoot, requestedPath = ASSISTANT_DASHBOARD_OUTPUT_REF) {
  if (!repoRoot) {
    throw new Error("repoRoot is required");
  }
  const stateDir = path.resolve(repoRoot, "guild_hall", "state", "assistant_dashboard");
  const outputPath = path.resolve(repoRoot, requestedPath);
  const relative = path.relative(stateDir, outputPath);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("assistant dashboard output must stay under guild_hall/state/assistant_dashboard");
  }
  return outputPath;
}

export async function buildAssistantDashboard({
  repoRoot,
  workmetaRoot = path.join(repoRoot, "_workmeta"),
  now = new Date().toISOString(),
} = {}) {
  if (!repoRoot) {
    throw new Error("repoRoot is required");
  }

  const today = dateOnlyKst(now);
  const deadlineValidation = await validateDeadlineWatchLedgers({ repoRoot, workmetaRoot });
  const projectRows = [];
  const deadlineRows = [];
  const openActionRows = [];
  const workRows = [];
  const projectLedgerErrors = [];

  if (await pathExists(workmetaRoot)) {
    const entries = await fs.readdir(workmetaRoot, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }
      const projectCode = entry.name;
      const projectRoot = path.join(workmetaRoot, projectCode);
      const projectDeadlineRows = await readDeadlineRows(repoRoot, projectRoot, projectCode);
      const projectOpenActions = await readOpenActionRows(repoRoot, projectRoot, projectCode, projectLedgerErrors);
      const projectWorkRows = await readWorkLedgerRows(repoRoot, projectRoot, projectCode, projectLedgerErrors);
      deadlineRows.push(...projectDeadlineRows);
      openActionRows.push(...projectOpenActions);
      workRows.push(...projectWorkRows);
      if (projectDeadlineRows.length || projectOpenActions.length || projectWorkRows.length) {
        projectRows.push({
          project_code: projectCode,
          source_refs: sourceRefsForProject(repoRoot, projectRoot),
          deadline_counts: countBy(projectDeadlineRows, "status"),
          open_action_counts: countBy(projectOpenActions, "status"),
          work_status_counts: countBy(projectWorkRows, "status"),
          active_deadline_count: projectDeadlineRows.filter(isActiveDeadline).length,
          active_open_action_count: projectOpenActions.filter(isActiveOpenAction).length,
          recent_done_count: projectWorkRows.filter(isDoneWork).length,
          top_open_actions: projectOpenActions.filter(isActiveOpenAction).slice(0, 5),
        });
      }
    }
  }

  const activeDeadlines = deadlineRows.filter(isActiveDeadline);
  const overdueDeadlines = activeDeadlines.filter((row) => row.due_date_kst && row.due_date_kst < today);
  const dueTodayDeadlines = activeDeadlines.filter((row) => row.due_date_kst === today);
  const highOpenActions = openActionRows.filter((row) => isActiveOpenAction(row) && row.priority === "High");
  const waitingRows = [
    ...activeDeadlines.filter((row) => row.status === "waiting"),
    ...openActionRows.filter((row) => row.status === "waiting"),
    ...workRows.filter((row) => row.status === "waiting"),
  ];
  const doneRecent = workRows.filter(isDoneWork).sort(compareRecentWork).slice(0, 10);
  const sourceHealth = await buildSourceHealth(repoRoot, now);
  const sourceHealthWarnings = sourceHealth.filter((item) => item.status === "stale" || item.status === "missing" || item.status === "invalid");
  const sourceHealthInvalid = sourceHealth.some((item) => item.status === "invalid");
  const validationFailed = deadlineValidation.status !== "pass" || projectLedgerErrors.length > 0;

  const dashboard = {
    schema_version: ASSISTANT_DASHBOARD_SCHEMA_VERSION,
    kind: "assistant_dashboard_readonly_rollup",
    generated_at: now,
    today_kst: today,
    status: validationFailed || sourceHealthInvalid ? "degraded" : "ok",
    source_refs: {
      workmeta_root: relativeToRepo(repoRoot, workmetaRoot),
      output_ref: ASSISTANT_DASHBOARD_OUTPUT_REF,
    },
    summary: {
      project_count: projectRows.length,
      active_deadline_count: activeDeadlines.length,
      overdue_deadline_count: overdueDeadlines.length,
      due_today_deadline_count: dueTodayDeadlines.length,
      active_open_action_count: openActionRows.filter(isActiveOpenAction).length,
      high_open_action_count: highOpenActions.length,
      waiting_item_count: waitingRows.length,
      recent_done_count: doneRecent.length,
      p00_unresolved_deadline_count: activeDeadlines.filter((row) => row.project_code === "P00-000_INBOX").length,
      stale_warning_count: sourceHealthWarnings.length,
    },
    sections: {
      today_risk: [...overdueDeadlines, ...dueTodayDeadlines, ...highOpenActions].slice(0, 20),
      p00_unresolved_deadlines: activeDeadlines.filter((row) => row.project_code === "P00-000_INBOX").slice(0, 20),
      projects: projectRows.sort((left, right) => left.project_code.localeCompare(right.project_code)),
      waiting_on_people: summarizeWaitingByOwner(waitingRows).slice(0, 20),
      done_recent: doneRecent,
      ai_data_health: sourceHealth,
    },
    validation: {
      deadline_watch: {
        status: deadlineValidation.status,
        checked_register_count: deadlineValidation.checked_register_count,
        checked_row_count: deadlineValidation.checked_row_count,
        checked_event_log_count: deadlineValidation.checked_event_log_count,
        checked_event_count: deadlineValidation.checked_event_count,
        error_count: deadlineValidation.error_count,
      },
      project_ledgers: {
        status: projectLedgerErrors.length === 0 ? "pass" : "degraded",
        checked_surface_count: projectRows.length,
        error_count: projectLedgerErrors.length,
        errors: projectLedgerErrors.slice(0, 50),
      },
    },
    boundary: {
      read_only_rollup: true,
      project_ledgers_are_truth: true,
      raw_payload_copied: false,
      raw_mail_body_read: false,
      raw_html_read: false,
      attachment_payload_read: false,
      telegram_sent: false,
      calendar_mutated: false,
      project_assignment_confirmed: false,
    },
  };

  const validation = validateAssistantDashboard(dashboard);
  if (!validation.ok) {
    throw new Error(`assistant dashboard validation failed: ${validation.errors.join("; ")}`);
  }

  return dashboard;
}

export async function writeAssistantDashboard(dashboard, outputFile, { repoRoot } = {}) {
  const safeOutputFile = resolveAssistantDashboardOutputPath(repoRoot, outputFile);
  await writeJson(safeOutputFile, dashboard);
  return safeOutputFile;
}

export function validateAssistantDashboard(dashboard) {
  const errors = [];
  if (dashboard?.schema_version !== ASSISTANT_DASHBOARD_SCHEMA_VERSION) {
    errors.push("schema_version_mismatch");
  }
  if (dashboard?.kind !== "assistant_dashboard_readonly_rollup") {
    errors.push("kind_mismatch");
  }
  if (dashboard?.boundary?.read_only_rollup !== true) {
    errors.push("read_only_rollup_boundary_missing");
  }
  if (dashboard?.boundary?.project_ledgers_are_truth !== true) {
    errors.push("project_truth_boundary_missing");
  }
  if (dashboard?.source_refs?.output_ref !== ASSISTANT_DASHBOARD_OUTPUT_REF) {
    errors.push("output_ref_must_be_local_assistant_dashboard_state");
  }
  if (dashboard?.status !== "ok" && dashboard?.status !== "degraded") {
    errors.push("status_must_be_ok_or_degraded");
  }
  validateAiDataHealthRows(errors, dashboard);
  if (
    Array.isArray(dashboard?.sections?.ai_data_health) &&
    dashboard.sections.ai_data_health.some((row) => row?.status === "invalid") &&
    dashboard?.status !== "degraded"
  ) {
    errors.push("invalid_ai_data_health_requires_degraded_dashboard");
  }
  for (const key of ["raw_payload_copied", "raw_mail_body_read", "raw_html_read", "attachment_payload_read", "telegram_sent", "calendar_mutated", "project_assignment_confirmed"]) {
    if (dashboard?.boundary?.[key] !== false) {
      errors.push(`boundary_${key}_must_be_false`);
    }
  }
  const serialized = JSON.stringify(dashboard);
  if (BANNED_PAYLOAD_MARKER.test(serialized)) {
    errors.push("banned_payload_or_secret_marker");
  }
  return {
    ok: errors.length === 0,
    errors,
  };
}

async function readDeadlineRows(repoRoot, projectRoot, projectCode) {
  const registerFile = path.join(projectRoot, "reports", "deadline_watch", "deadline_register.csv");
  if (!(await pathExists(registerFile))) {
    return [];
  }
  const raw = await fs.readFile(registerFile, "utf8");
  const lines = raw.replace(/^\uFEFF/u, "").split(/\r?\n/u).filter((line) => line.trim() !== "");
  if (lines.length <= 1) {
    return [];
  }
  const header = parseCsvLine(lines[0]);
  if (header.join(",") !== DEADLINE_REGISTER_HEADERS.join(",")) {
    return [];
  }
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    const row = Object.fromEntries(DEADLINE_REGISTER_HEADERS.map((column, index) => [column, values[index] ?? ""]));
    return {
      kind: "deadline",
      project_code: projectCode,
      deadline_id: row.deadline_id,
      status: row.status,
      action_type: row.action_type,
      due_at: row.due_at,
      due_date_kst: normalizeDashboardDueDate(row.due_at),
      due_text: row.due_text,
      subject_hint: safeShort(row.subject_hint, 120),
      owner_or_contact: safeShort(row.owner_or_contact, 80),
      source_ref: relativeToRepo(repoRoot, registerFile),
      claim_ceiling: row.claim_ceiling,
    };
  });
}

async function readOpenActionRows(repoRoot, projectRoot, projectCode, projectLedgerErrors) {
  const filePath = path.join(projectRoot, "reports", "open_actions", "open_action_register.md");
  if (!(await pathExists(filePath))) {
    return [];
  }
  const raw = await fs.readFile(filePath, "utf8");
  return parseMarkdownTable(raw)
    .filter((row) => row.ID && row.Status)
    .map((row) => {
      const sourceRef = `${relativeToRepo(repoRoot, filePath)}#action=${safeIdentifier(row.ID)}`;
      const beforeErrorCount = projectLedgerErrors.length;
      validateDashboardTextField(projectLedgerErrors, sourceRef, "item", row.Item, 240);
      validateDashboardTextField(projectLedgerErrors, sourceRef, "owner_or_contact", row["Owner/Contact"], 120);
      validateDashboardTextField(projectLedgerErrors, sourceRef, "next_action", row["Next action"], 240);
      if (projectLedgerErrors.length > beforeErrorCount) {
        return null;
      }
      return {
        kind: "open_action",
        project_code: projectCode,
        action_id: row.ID,
        date_opened: row["Date opened"] ?? "",
        priority: row.Priority ?? "",
        item: safeShort(row.Item, 120),
        status: normalizeWorkStatus(row.Status),
        owner_or_contact: safeShort(row["Owner/Contact"], 80),
        next_action: safeShort(row["Next action"], 160),
        source_ref: relativeToRepo(repoRoot, filePath),
        claim_ceiling: "observed",
      };
    })
    .filter(Boolean);
}

async function readWorkLedgerRows(repoRoot, projectRoot, projectCode, projectLedgerErrors) {
  const filePath = path.join(projectRoot, "reports", "작업_장부", "작업_장부.csv");
  if (!(await pathExists(filePath))) {
    return [];
  }
  const raw = await fs.readFile(filePath, "utf8");
  const lines = raw.replace(/^\uFEFF/u, "").split(/\r?\n/u).filter((line) => line.trim() !== "");
  if (lines.length <= 1) {
    return [];
  }
  const headers = parseCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    const row = Object.fromEntries(headers.map((column, index) => [column, values[index] ?? ""]));
    const sourceRef = `${relativeToRepo(repoRoot, filePath)}#work=${safeIdentifier(row["작업키"] || row["기록일"] || "row")}`;
    const beforeErrorCount = projectLedgerErrors.length;
    validateDashboardTextField(projectLedgerErrors, sourceRef, "owner_or_contact", row["담당자"], 120);
    validateDashboardTextField(projectLedgerErrors, sourceRef, "title", row["작업명"], 240);
    validateDashboardTextField(projectLedgerErrors, sourceRef, "next_action", row["다음액션"], 240);
    if (projectLedgerErrors.length > beforeErrorCount) {
      return null;
    }
    return {
      kind: "work_ledger",
      project_code: row["프로젝트코드"] || projectCode,
      work_id: row["작업키"] ?? "",
      date: row["기록일"] ?? "",
      owner_or_contact: safeShort(row["담당자"], 80),
      work_type: row["작업구분"] ?? "",
      title: safeShort(row["작업명"], 120),
      status: normalizeWorkStatus(row["상태"]),
      done: String(row["완료여부"] ?? "").toLowerCase() === "true",
      next_action: safeShort(row["다음액션"], 160),
      source_ref: relativeToRepo(repoRoot, filePath),
      claim_ceiling: "observed",
    };
  }).filter(Boolean);
}

async function buildSourceHealth(repoRoot, now) {
  const sources = [
    {
      id: "mail_work_status",
      ref: "guild_hall/state/gateway/mail_work_status/latest.json",
      max_age_hours: 24,
    },
    {
      id: "mail_work_priority",
      ref: "guild_hall/state/gateway/mail_work_status/priority_latest.json",
      max_age_hours: 24,
    },
    {
      id: "snapshot",
      ref: "guild_hall/state/snapshot/soulforge_snapshot.json",
      max_age_hours: 48,
    },
  ];
  const rows = [];
  for (const source of sources) {
    const filePath = path.join(repoRoot, source.ref);
    if (!(await pathExists(filePath))) {
      rows.push({
        id: source.id,
        source_ref: source.ref,
        status: "missing",
        generated_at: null,
        age_hours: null,
        max_age_hours: source.max_age_hours,
      });
      continue;
    }
    const json = await readJson(filePath);
    const generatedAt = json.generated_at ?? null;
    const ageHours = generatedAt ? ageHoursBetween(generatedAt, now) : null;
    if (source.id === "snapshot") {
      const validation = validateSnapshot(json);
      if (!validation.ok) {
        rows.push({
          id: source.id,
          source_ref: source.ref,
          status: "invalid",
          generated_at: generatedAt,
          age_hours: ageHours === null ? null : Number(ageHours.toFixed(2)),
          max_age_hours: source.max_age_hours,
          error_count: validation.errors.length,
          reason: "snapshot_contract_invalid",
        });
        continue;
      }
    }
    rows.push({
      id: source.id,
      source_ref: source.ref,
      status: ageHours !== null && ageHours <= source.max_age_hours ? "fresh" : "stale",
      generated_at: generatedAt,
      age_hours: ageHours === null ? null : Number(ageHours.toFixed(2)),
      max_age_hours: source.max_age_hours,
    });
  }
  return rows;
}

function validateAiDataHealthRows(errors, dashboard) {
  const rows = dashboard?.sections?.ai_data_health;
  if (!Array.isArray(rows)) {
    errors.push("ai_data_health_must_be_array");
    return;
  }
  for (const [index, row] of rows.entries()) {
    const rowPath = `ai_data_health[${index}]`;
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      errors.push(`${rowPath}_must_be_object`);
      continue;
    }
    for (const key of Object.keys(row)) {
      if (!AI_DATA_HEALTH_ROW_KEYS.has(key)) {
        errors.push(`${rowPath}_unknown_key_${key}`);
      }
    }
    if (typeof row.id !== "string" || !row.id) {
      errors.push(`${rowPath}_id_must_be_string`);
    }
    if (typeof row.source_ref !== "string" || !row.source_ref) {
      errors.push(`${rowPath}_source_ref_must_be_string`);
    }
    if (!AI_DATA_HEALTH_STATUSES.has(row.status)) {
      errors.push(`${rowPath}_status_must_be_known`);
    }
    if (row.generated_at !== null && row.generated_at !== undefined && typeof row.generated_at !== "string") {
      errors.push(`${rowPath}_generated_at_must_be_string_or_null`);
    }
    if (row.age_hours !== null && row.age_hours !== undefined && typeof row.age_hours !== "number") {
      errors.push(`${rowPath}_age_hours_must_be_number_or_null`);
    }
    if (typeof row.max_age_hours !== "number") {
      errors.push(`${rowPath}_max_age_hours_must_be_number`);
    }
    if (row.error_count !== undefined && (!Number.isInteger(row.error_count) || row.error_count < 0)) {
      errors.push(`${rowPath}_error_count_must_be_nonnegative_integer`);
    }
    if (row.reason !== undefined && !/^[a-z0-9_]{1,80}$/u.test(row.reason)) {
      errors.push(`${rowPath}_reason_must_be_short_code`);
    }
    if (row.status === "invalid") {
      if (!Number.isInteger(row.error_count) || row.error_count < 1) {
        errors.push(`${rowPath}_invalid_requires_error_count`);
      }
      if (typeof row.reason !== "string") {
        errors.push(`${rowPath}_invalid_requires_reason`);
      }
    }
  }
}

function sourceRefsForProject(repoRoot, projectRoot) {
  const refs = {};
  for (const [key, suffix] of Object.entries({
    deadline_watch: "reports/deadline_watch/deadline_register.csv",
    open_actions: "reports/open_actions/open_action_register.md",
    work_ledger: "reports/작업_장부/작업_장부.csv",
  })) {
    refs[key] = relativeToRepo(repoRoot, path.join(projectRoot, suffix));
  }
  return refs;
}

function parseMarkdownTable(markdown) {
  const lines = String(markdown ?? "").split(/\r?\n/u).filter((line) => line.trim().startsWith("|"));
  if (lines.length < 3) {
    return [];
  }
  const headers = splitMarkdownRow(lines[0]);
  return lines.slice(2).map((line) => {
    const values = splitMarkdownRow(line);
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
  });
}

function splitMarkdownRow(line) {
  return String(line)
    .replace(/^\s*\|/u, "")
    .replace(/\|\s*$/u, "")
    .split("|")
    .map((cell) => cell.trim().replace(/^`|`$/gu, ""));
}

function parseCsvLine(line) {
  const cells = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (quoted) {
      if (char === '"' && line[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      cells.push(cell);
      cell = "";
    } else {
      cell += char;
    }
  }
  cells.push(cell);
  return cells;
}

function summarizeWaitingByOwner(rows) {
  const grouped = new Map();
  for (const row of rows) {
    const owner = row.owner_or_contact || "unassigned";
    if (!grouped.has(owner)) {
      grouped.set(owner, {
        owner_or_contact: owner,
        count: 0,
        items: [],
      });
    }
    const group = grouped.get(owner);
    group.count += 1;
    if (group.items.length < 5) {
      group.items.push({
        kind: row.kind,
        project_code: row.project_code,
        id: row.deadline_id ?? row.action_id ?? row.work_id ?? "",
        title: row.subject_hint ?? row.item ?? row.title ?? "",
        status: row.status,
        source_ref: row.source_ref,
      });
    }
  }
  return [...grouped.values()].sort((left, right) => right.count - left.count || left.owner_or_contact.localeCompare(right.owner_or_contact));
}

function isActiveDeadline(row) {
  return ACTIVE_DEADLINE_STATUSES.has(row.status);
}

function isActiveOpenAction(row) {
  return ACTIVE_WORK_STATUSES.has(row.status);
}

function isDoneWork(row) {
  return row.done || DONE_WORK_STATUSES.has(row.status);
}

function compareRecentWork(left, right) {
  return String(right.date).localeCompare(String(left.date)) || String(right.work_id).localeCompare(String(left.work_id));
}

function countBy(rows, field) {
  const counts = {};
  for (const row of rows) {
    const key = row[field] || "unknown";
    counts[key] = Number(counts[key] ?? 0) + 1;
  }
  return counts;
}

function normalizeWorkStatus(value) {
  const text = String(value ?? "").trim().toLowerCase();
  if (text === "todo") {
    return "open";
  }
  return text || "unknown";
}

function safeShort(value, limit) {
  const text = String(value ?? "").replace(/\s+/gu, " ").trim();
  if (text.length <= limit) {
    return text;
  }
  return `${text.slice(0, Math.max(0, limit - 3))}...`;
}

function safeIdentifier(value) {
  return String(value ?? "")
    .replace(/[^A-Za-z0-9_.:-]/gu, "_")
    .slice(0, 80) || "row";
}

function validateDashboardTextField(errors, sourceRef, field, value, limit) {
  const text = String(value ?? "");
  if (text.length > limit) {
    errors.push({ ref: sourceRef, field, reason: "field_too_long_for_dashboard" });
    return;
  }
  if (BANNED_PAYLOAD_MARKER.test(text)) {
    errors.push({ ref: sourceRef, field, reason: "blocked_payload_marker_detected" });
    return;
  }
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/u.test(text)) {
    errors.push({ ref: sourceRef, field, reason: "control_character_detected" });
  }
}

function normalizeDashboardDueDate(value) {
  const text = String(value ?? "").trim();
  if (!text) {
    return "";
  }
  if (/^\d{4}-\d{2}-\d{2}$/u.test(text)) {
    return text;
  }
  return dateOnlyKst(text);
}

function dateOnlyKst(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return "";
  }
  return new Date(date.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function ageHoursBetween(generatedAt, now) {
  const generated = new Date(generatedAt).getTime();
  const current = new Date(now).getTime();
  if (!Number.isFinite(generated) || !Number.isFinite(current)) {
    return null;
  }
  return Math.max(0, (current - generated) / 3_600_000);
}

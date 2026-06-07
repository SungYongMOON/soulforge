import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

import {
  pathExists,
  readJson,
  relativeToRepo,
} from "../shared/io.mjs";
import { emitNotification } from "../town_crier/runtime.mjs";
import { defaultMailWorkPriorityLatestFile } from "./mail_work_status.mjs";

export const MAIL_TASK_REGISTER_SCHEMA_VERSION = "soulforge.gateway.mail_task_register.v0";

export const OPEN_ACTION_REGISTER_HEADERS = [
  "ID",
  "Date opened",
  "Priority",
  "Item",
  "Status",
  "Owner/Contact",
  "Next action",
  "Evidence",
];

const OPEN_ACTION_HEADER_LINE = `| ${OPEN_ACTION_REGISTER_HEADERS.join(" | ")} |`;
const OPEN_ACTION_SEPARATOR_LINE = "| --- | --- | --- | --- | --- | --- | --- | --- |";
const TERMINAL_WORK_STATUSES = new Set(["completed", "completed_with_follow_up", "blocked", "failed"]);
const OWNER_REVIEW_PROJECT_CODE = "P00-000_INBOX";
const PROJECT_CODE_PATTERN = /^P(?!00-)\d{2}-\d{3}$/u;
const BANNED_PAYLOAD_KEY = /body_text|body_html|provider_payload|raw_body|raw_html|attachment_filename|attachment_file|attachment_path|attachment_url|download_url|local_path|provider_attachment_id|token|password|cookie|secret|credential|session/iu;
const BANNED_PAYLOAD_VALUE = /body_text|body_html|provider_payload|raw_body|raw_html|attachment_filename|attachment_file|attachment_path|attachment_url|download_url|local_path|provider_attachment_id|token|password|cookie|secret|credential|session/iu;

export function defaultOpenActionRegisterFile(repoRoot, projectCode) {
  return path.join(repoRoot, "_workmeta", projectCode, "reports", "open_actions", "open_action_register.md");
}

export async function registerMailTasksFromPriorityProjection({
  repoRoot,
  latestFile = defaultMailWorkPriorityLatestFile(repoRoot),
  workmetaRoot = path.join(repoRoot, "_workmeta"),
  apply = false,
  notify = false,
  now = new Date().toISOString(),
} = {}) {
  if (!repoRoot) {
    throw new Error("repoRoot is required");
  }
  await assertLatestFileBoundary({ repoRoot, latestFile });
  if (apply) {
    assertCanonicalWorkmetaRoot({ repoRoot, workmetaRoot });
  }

  const projection = await readJson(latestFile);
  validateMailWorkPriorityProjection(projection);
  const built = buildOpenActionRowsFromPriorityProjection(projection, { now });

  let applyResult = {
    written_count: 0,
    duplicate_count: 0,
    register_refs: built.rows.map((row) => row.register_ref),
    written_rows: [],
  };

  if (apply) {
    applyResult = await writeOpenActionRows({
      repoRoot,
      workmetaRoot,
      rows: built.rows,
    });
  }

  const notification = await maybeQueueNotifications({
    repoRoot,
    apply,
    notify,
    writtenRows: applyResult.written_rows,
  });

  return {
    schema_version: MAIL_TASK_REGISTER_SCHEMA_VERSION,
    kind: "mail_task_register",
    status: apply ? "applied" : "dry_run",
    generated_at: now,
    projection_ref: relativeToRepo(repoRoot, latestFile),
    source_count: built.source_count,
    writable_count: built.rows.length,
    written_count: applyResult.written_count,
    duplicate_count: applyResult.duplicate_count,
    owner_review_count: built.owner_review.length,
    skipped_count: built.skipped.length,
    register_refs: applyResult.register_refs,
    owner_review_refs: built.owner_review.map((item) => item.source_ref).filter(Boolean),
    skipped_refs: built.skipped.map((item) => item.source_ref).filter(Boolean),
    notification,
    private_metadata_sync: buildPrivateMetadataSyncSummary(applyResult.written_count),
    boundary: {
      raw_payload_copied: false,
      raw_mail_body_read: false,
      raw_html_read: false,
      attachment_payload_read: false,
      live_mailbox_read: false,
      town_crier_queue_written: notification.queued_count > 0,
      telegram_sent: false,
      private_metadata_synced: false,
      apply_requested: Boolean(apply),
    },
  };
}

export function buildOpenActionRowsFromPriorityProjection(projection, { now = new Date().toISOString() } = {}) {
  const entries = Array.isArray(projection?.entries) ? projection.entries : [];
  const rows = [];
  const ownerReview = [];
  const skipped = [];

  for (const entry of entries) {
    const decision = buildOpenActionRowFromPriorityEntry(entry, { now });
    if (decision.row) {
      rows.push(decision.row);
      continue;
    }
    if (decision.owner_review) {
      ownerReview.push(decision.owner_review);
      continue;
    }
    skipped.push(decision.skipped);
  }

  rows.sort(compareOpenActionRows);

  return {
    source_count: entries.length,
    rows,
    owner_review: ownerReview,
    skipped,
  };
}

function buildOpenActionRowFromPriorityEntry(entry, { now }) {
  const sourceRef = resolveSourceRef(entry);

  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    return skip(sourceRef, "invalid_entry");
  }
  if (entry.boundary?.raw_payload_copied === true) {
    return skip(sourceRef, "raw_payload_boundary_failed");
  }
  if (hasBannedPayloadMarker(entry)) {
    return skip(sourceRef, "metadata_safety_failed");
  }
  if (TERMINAL_WORK_STATUSES.has(String(entry.work_status ?? ""))) {
    return skip(sourceRef, "terminal_work_status");
  }
  if (entry.route_candidate === "none/personal" || entry.route_candidate === "none/promo") {
    return skip(sourceRef, `non_project_route:${entry.route_candidate}`);
  }
  if (!sourceRef) {
    return skip(null, "missing_source_ref");
  }

  const routeCandidate = String(entry.route_candidate ?? "");
  const routeConfidence = String(entry.route_confidence ?? "");
  if (routeCandidate === OWNER_REVIEW_PROJECT_CODE || routeCandidate.startsWith("P00") || routeConfidence === "review") {
    return ownerReview(sourceRef, "owner_review_route");
  }
  if (!PROJECT_CODE_PATTERN.test(routeCandidate) || routeConfidence !== "exact") {
    return ownerReview(sourceRef, "route_not_exact");
  }

  const actionId = buildOpenActionId(routeCandidate, sourceRef);
  const registerRef = `_workmeta/${routeCandidate}/reports/open_actions/open_action_register.md#action=${actionId}`;
  const row = {
    id: actionId,
    project_code: routeCandidate,
    date_opened: dateOnly(entry.received_at) || dateOnly(now),
    priority: resolvePriority(entry),
    item: buildItemText(entry),
    status: "open",
    owner_or_contact: "",
    next_action: "Review source ref and handle the mail-derived request.",
    evidence: sourceRef,
    claim_ceiling: "observed",
    raw_payload_copied: false,
    register_ref: registerRef,
  };

  return { row, skipped: null, owner_review: null };
}

function skip(sourceRef, reason) {
  return {
    row: null,
    owner_review: null,
    skipped: {
      source_ref: sourceRef || null,
      reason,
    },
  };
}

function ownerReview(sourceRef, reason) {
  return {
    row: null,
    skipped: null,
    owner_review: {
      source_ref: sourceRef || null,
      reason,
    },
  };
}

async function writeOpenActionRows({ repoRoot, workmetaRoot, rows }) {
  const grouped = groupByProject(rows);
  const writtenRows = [];
  const registerRefs = rows.map((row) => row.register_ref);
  let writtenCount = 0;
  let duplicateCount = 0;

  for (const [projectCode, projectRows] of grouped.entries()) {
    const registerFile = path.join(workmetaRoot, projectCode, "reports", "open_actions", "open_action_register.md");
    assertOpenActionRegisterPath({ workmetaRoot, registerFile });

    const existing = await readOpenActionRegister(registerFile);
    const existingIds = new Set(existing.rows.map((row) => row.ID).filter(Boolean));
    const newRows = [];

    for (const row of projectRows) {
      if (existingIds.has(row.id)) {
        duplicateCount += 1;
        continue;
      }
      existingIds.add(row.id);
      newRows.push(row);
    }

    if (newRows.length === 0) {
      continue;
    }

    const nextText = renderOpenActionRegister(existing, newRows);
    await fs.mkdir(path.dirname(registerFile), { recursive: true });
    await fs.writeFile(registerFile, nextText, "utf8");
    writtenCount += newRows.length;
    writtenRows.push(...newRows.map((row) => ({
      ...row,
      register_ref: `${relativeToRepo(repoRoot, registerFile)}#action=${row.id}`,
    })));
  }

  return {
    written_count: writtenCount,
    duplicate_count: duplicateCount,
    register_refs: registerRefs,
    written_rows: writtenRows,
  };
}

async function readOpenActionRegister(registerFile) {
  if (!(await pathExists(registerFile))) {
    return {
      exists: false,
      lines: ["# Open Actions", "", OPEN_ACTION_HEADER_LINE, OPEN_ACTION_SEPARATOR_LINE],
      header_index: 2,
      table_end_index: 4,
      rows: [],
    };
  }

  const raw = await fs.readFile(registerFile, "utf8");
  const lines = raw.replace(/^\uFEFF/u, "").split(/\r?\n/u);
  while (lines.length > 0 && lines.at(-1) === "") {
    lines.pop();
  }

  const headerIndex = lines.findIndex((line) => normalizeMarkdownTableLine(line) === normalizeMarkdownTableLine(OPEN_ACTION_HEADER_LINE));
  if (headerIndex === -1) {
    throw new Error(`open action register header mismatch: ${registerFile}`);
  }
  if (!lines[headerIndex + 1] || !isMarkdownSeparatorLine(lines[headerIndex + 1])) {
    throw new Error(`open action register separator missing: ${registerFile}`);
  }

  let tableEndIndex = headerIndex + 2;
  while (tableEndIndex < lines.length && lines[tableEndIndex].trim().startsWith("|")) {
    tableEndIndex += 1;
  }

  const rows = lines.slice(headerIndex + 2, tableEndIndex).map((line) => {
    const cells = parseMarkdownTableRow(line);
    return Object.fromEntries(OPEN_ACTION_REGISTER_HEADERS.map((header, index) => [header, cells[index] ?? ""]));
  });

  return {
    exists: true,
    lines,
    header_index: headerIndex,
    table_end_index: tableEndIndex,
    rows,
  };
}

function renderOpenActionRegister(existing, newRows) {
  const renderedRows = newRows.map(renderOpenActionRow);
  const lines = [...existing.lines];
  lines.splice(existing.table_end_index, 0, ...renderedRows);
  return `${lines.join("\n")}\n`;
}

function renderOpenActionRow(row) {
  const cells = [
    row.id,
    row.date_opened,
    row.priority,
    row.item,
    row.status,
    row.owner_or_contact,
    row.next_action,
    row.evidence,
  ];
  return `| ${cells.map(markdownCell).join(" | ")} |`;
}

async function maybeQueueNotifications({ repoRoot, apply, notify, writtenRows }) {
  const summary = {
    requested: Boolean(notify),
    status: "not_requested",
    event: "mail_received",
    attempted_count: 0,
    queued_count: 0,
    disabled_count: 0,
    failed_count: 0,
    queue_refs: [],
  };

  if (!notify) {
    return summary;
  }
  if (!apply) {
    return {
      ...summary,
      status: "dry_run_not_queued",
    };
  }
  if (writtenRows.length === 0) {
    return {
      ...summary,
      status: "no_written_rows",
    };
  }

  for (const row of writtenRows) {
    summary.attempted_count += 1;
    const result = await emitNotification(repoRoot, {
      scope: "gateway",
      event: "mail_received",
      text: renderNotificationText(row),
      sourceRef: row.register_ref,
    });
    if (result.status === "queued") {
      summary.queued_count += 1;
      if (result.queue_file) {
        summary.queue_refs.push(result.queue_file);
      }
    } else if (result.status === "disabled") {
      summary.disabled_count += 1;
    } else {
      summary.failed_count += 1;
    }
  }

  return {
    ...summary,
    status: summary.queued_count > 0
      ? "queued"
      : summary.failed_count > 0
        ? "partial_or_failed"
        : "disabled",
  };
}

function renderNotificationText(row) {
  return truncateText(`Mail-derived open action registered: ${row.project_code} ${row.item} (${row.id})`, 220);
}

function buildPrivateMetadataSyncSummary(writtenCount) {
  const hasWrites = writtenCount > 0;
  return {
    status: hasWrites ? "manual_sync_required" : "planned",
    commit_intent: hasWrites ? "prepare_private_metadata_commit" : "none",
    push_intent: hasWrites ? "prepare_private_metadata_push" : "none",
    recommended_command: "npm run guild-hall:workmeta:sync -- --json",
    automatic_commit: false,
    automatic_push: false,
  };
}

function validateMailWorkPriorityProjection(projection) {
  if (!projection || typeof projection !== "object" || Array.isArray(projection)) {
    throw new Error("mail work priority projection must be an object");
  }
  if (projection.schema_version !== "soulforge.gateway.mail_work_priority.v1") {
    throw new Error("mail work priority projection schema_version mismatch");
  }
  if (projection.kind !== "mail_work_priority_projection") {
    throw new Error("mail work priority projection kind mismatch");
  }
  if (projection.boundary?.raw_payload_copied !== false) {
    throw new Error("mail work priority projection boundary must declare raw_payload_copied=false");
  }
  if (!Array.isArray(projection.entries)) {
    throw new Error("mail work priority projection entries must be an array");
  }
}

async function assertLatestFileBoundary({ repoRoot, latestFile }) {
  const resolvedRepoRoot = path.resolve(repoRoot);
  const resolved = path.resolve(resolvedRepoRoot, latestFile);
  const realRepoRoot = (await realPathIfExists(resolvedRepoRoot)) ?? resolvedRepoRoot;
  const inspectedPaths = [
    { root: resolvedRepoRoot, file: resolved },
    { root: realRepoRoot, file: await realPathIfExists(resolved) },
  ];
  for (const inspectedPath of inspectedPaths.filter((item) => Boolean(item.file))) {
    if (!isPathInside(inspectedPath.root, inspectedPath.file)) {
      throw new Error("mail task register latest-file must stay under the active repo root");
    }
    if (isPathInside(path.join(inspectedPath.root, "guild_hall", "state", "gateway", "mailbox"), inspectedPath.file)) {
      throw new Error("mail task register must not read gateway mailbox raw/event roots");
    }
    if (isPathInside(path.join(inspectedPath.root, "private-state"), inspectedPath.file)) {
      throw new Error("mail task register must not read private-state projection copies");
    }
    if (isPathInside(path.join(inspectedPath.root, "_workspaces"), inspectedPath.file)) {
      throw new Error("mail task register must not read _workspaces payload roots");
    }
  }
  if (path.extname(resolved) !== ".json") {
    throw new Error("mail task register latest-file must be a JSON projection");
  }
}

async function realPathIfExists(filePath) {
  try {
    return await fs.realpath(filePath);
  } catch (error) {
    if (error?.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

function assertCanonicalWorkmetaRoot({ repoRoot, workmetaRoot }) {
  const expectedRoot = path.resolve(repoRoot, "_workmeta");
  const actualRoot = path.resolve(workmetaRoot);
  if (actualRoot !== expectedRoot) {
    throw new Error("mail task register apply must use the canonical repo _workmeta root");
  }
}

function assertOpenActionRegisterPath({ workmetaRoot, registerFile }) {
  const relative = path.relative(workmetaRoot, registerFile).split(path.sep).join("/");
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("open action register output must stay under _workmeta");
  }
  if (!/^[^/]+\/reports\/open_actions\/open_action_register[.]md$/u.test(relative)) {
    throw new Error("open action register output must stay under _workmeta/<project_code>/reports/open_actions/open_action_register.md");
  }
}

function resolveSourceRef(entry) {
  return firstNonEmpty(
    entry?.refs?.candidate_ref,
    entry?.mail_source_ref ? `mail_source_ref:${entry.mail_source_ref}` : "",
  );
}

function buildOpenActionId(projectCode, sourceRef) {
  const digest = createHash("sha256")
    .update(`${projectCode}|${sourceRef}`)
    .digest("hex")
    .slice(0, 16);
  return `OA-${projectCode}-MAIL-${digest}`;
}

function buildItemText(entry) {
  const subject = truncateText(String(entry.subject ?? "").replace(/\s+/gu, " ").trim(), 120);
  if (subject) {
    return `Mail follow-up: ${subject}`;
  }
  return "Mail-derived follow-up from source ref";
}

function resolvePriority(entry) {
  if (entry.due_date || Number(entry.attachment_count ?? 0) > 0) {
    return "High";
  }
  if (Array.isArray(entry.priority_flags_ko) && entry.priority_flags_ko.length > 0) {
    return "High";
  }
  return "Medium";
}

function hasBannedPayloadMarker(value) {
  if (value === null || value === undefined) {
    return false;
  }
  if (typeof value === "string") {
    return BANNED_PAYLOAD_VALUE.test(value);
  }
  if (typeof value !== "object") {
    return false;
  }
  if (Array.isArray(value)) {
    return value.some((entry) => hasBannedPayloadMarker(entry));
  }
  for (const [key, entry] of Object.entries(value)) {
    if ((key !== "raw_payload_copied" && BANNED_PAYLOAD_KEY.test(key)) || hasBannedPayloadMarker(entry)) {
      return true;
    }
  }
  return false;
}

function parseMarkdownTableRow(line) {
  const text = line.trim().replace(/^\|/u, "").replace(/\|$/u, "");
  const cells = [];
  let cell = "";
  let escaped = false;

  for (const char of text) {
    if (escaped) {
      cell += char;
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === "|") {
      cells.push(cell.trim());
      cell = "";
      continue;
    }
    cell += char;
  }

  cells.push(cell.trim());
  return cells;
}

function normalizeMarkdownTableLine(line) {
  return String(line ?? "").trim().replace(/\s+/gu, " ");
}

function isMarkdownSeparatorLine(line) {
  const cells = parseMarkdownTableRow(line);
  return cells.length === OPEN_ACTION_REGISTER_HEADERS.length && cells.every((cell) => /^:?-{3,}:?$/u.test(cell));
}

function markdownCell(value) {
  return String(value ?? "")
    .replace(/\r?\n/gu, " ")
    .replace(/\|/gu, "\\|")
    .trim();
}

function dateOnly(value) {
  const text = String(value ?? "").trim();
  const direct = text.match(/^(\d{4}-\d{2}-\d{2})/u);
  if (direct) {
    return direct[1];
  }
  const parsed = new Date(text);
  if (!Number.isFinite(parsed.getTime())) {
    return "";
  }
  return parsed.toISOString().slice(0, 10);
}

function truncateText(value, limit) {
  const text = String(value ?? "");
  if (text.length <= limit) {
    return text;
  }
  return `${text.slice(0, Math.max(0, limit - 3))}...`;
}

function compareOpenActionRows(left, right) {
  return (
    String(left.project_code).localeCompare(String(right.project_code)) ||
    String(left.date_opened).localeCompare(String(right.date_opened)) ||
    String(left.id).localeCompare(String(right.id))
  );
}

function groupByProject(rows) {
  const grouped = new Map();
  for (const row of rows) {
    if (!grouped.has(row.project_code)) {
      grouped.set(row.project_code, []);
    }
    grouped.get(row.project_code).push(row);
  }
  return grouped;
}

function isPathInside(rootPath, targetPath) {
  const relative = path.relative(path.resolve(rootPath), path.resolve(targetPath));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function firstNonEmpty(...values) {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text) {
      return text;
    }
  }
  return "";
}

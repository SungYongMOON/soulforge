#!/usr/bin/env node
// Metadata-only project_context live-state updater for haengbogwan.
// This tool accepts explicit event metadata and upserts context state; it never
// reads raw mail bodies, attachments, workspace payloads, or secrets.
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname, extname, isAbsolute, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeThreadSubject } from "./mail_thread_key.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..", "..", "..", "..");
const DEFAULT_WORKMETA_ROOT = join(REPO, "_workmeta");
const SAFE_PROJECT_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const DATE_TIME_RE = /^\d{4}-\d{2}-\d{2}(?:[T ][0-9:.+\-Z]+)?$/;
const SCHEMA_VERSION = "soulforge.project_context.v0";
const HISTORY_MIN_OCCURRENCES = 3;
const HISTORY_WINDOW_DAYS = 56;

const CONTEXT_RELATIVE_PATH = "project_context";
const SUMMARY_RELATIVE_PATH = join(CONTEXT_RELATIVE_PATH, "summaries");
const DEFAULT_BRANCH_KEY = "unclassified";
const DEFAULT_BRANCH_LABEL = "Unclassified";
const MAIL_LEDGER_RELATIVE_PATH = join("reports", "\uBA54\uC77C_\uC774\uB825", "\uBA54\uC77C_\uC774\uB825.csv");
const TASK_LEDGER_RELATIVE_PATH = join("reports", "\uD560\uC77C_\uC7A5\uBD80", "\uD560\uC77C_\uC7A5\uBD80.csv");

const MGMT_SKELETON_SEEDS = [
  { ref: "contract_schedule", label: "Contract and schedule" },
  { ref: "procurement_delivery", label: "Procurement and delivery" },
  { ref: "quality", label: "Quality" },
  { ref: "meeting_channel", label: "Meeting channel" },
];

const CLOSED_STATUS_RE = /(done|closed|complete|completed|cancelled|canceled|dismissed|rejected|\uC644\uB8CC|\uC885\uACB0|\uCDE8\uC18C|\uAE30\uAC01)/i;
const UNCONFIRMED_STATUS_RE = /(unclassified|reference_only|needs[_ -]?triage|\uBBF8\uBD84\uB958|\uBD84\uB958\uD544\uC694)/i;

export const PROJECT_CONTEXT_FILES = {
  branches: join(CONTEXT_RELATIVE_PATH, "branches.csv"),
  occurrences: join(CONTEXT_RELATIVE_PATH, "occurrences.csv"),
  sources: join(CONTEXT_RELATIVE_PATH, "sources.csv"),
  nodes: join(CONTEXT_RELATIVE_PATH, "nodes.csv"),
  edges: join(CONTEXT_RELATIVE_PATH, "edges.csv"),
  judgments: join(CONTEXT_RELATIVE_PATH, "judgments.csv"),
  reviewQueue: join(CONTEXT_RELATIVE_PATH, "review_queue.csv"),
  projectSummary: join(SUMMARY_RELATIVE_PATH, "project_summary.md"),
  branchSummaries: join(SUMMARY_RELATIVE_PATH, "branch_summaries.csv"),
};

const CSV_HEADERS = {
  sources: [
    "source_id",
    "project_code",
    "source_kind",
    "external_ref",
    "source_time",
    "title",
    "branch_key",
    "branch_ref",
    "suggested_branch_ref",
    "summary_hint",
    "pointer_ref",
    "metadata_hash",
    "body_access",
    "created_at",
    "updated_at",
  ],
  nodes: [
    "node_id",
    "project_code",
    "node_type",
    "label",
    "branch_key",
    "status",
    "source_id",
    "metadata_hash",
    "created_at",
    "updated_at",
  ],
  edges: [
    "edge_id",
    "project_code",
    "from_node_id",
    "to_node_id",
    "edge_type",
    "source_id",
    "confidence",
    "reason",
    "created_at",
    "updated_at",
  ],
  judgments: [
    "judgment_id",
    "project_code",
    "source_id",
    "judgment_type",
    "operations",
    "confidence",
    "reason",
    "raw_payload_copied",
    "created_at",
    "updated_at",
  ],
  reviewQueue: [
    "review_id",
    "project_code",
    "source_id",
    "task_node_id",
    "branch_key",
    "review_type",
    "field",
    "proposed_value",
    "reason",
    "status",
    "created_at",
    "updated_at",
  ],
  branchSummaries: [
    "branch_id",
    "project_code",
    "branch_key",
    "label",
    "branch_kind",
    "anchor_ref",
    "status",
    "born_at",
    "closed_at",
    "source_count",
    "task_count",
    "open_review_count",
    "updated_at",
  ],
  branches: [
    "branch_id",
    "project_code",
    "branch_key",
    "label",
    "branch_kind",
    "anchor_ref",
    "status",
    "born_at",
    "closed_at",
    "updated_at",
  ],
  occurrences: [
    "occurrence_id",
    "project_code",
    "series_key",
    "occurrence_key",
    "branch_ref",
    "source_count",
    "spawned_item_refs",
    "created_at",
    "updated_at",
  ],
};

const FORBIDDEN_PAYLOAD_FIELDS = new Set([
  "body",
  "body_html",
  "html_body",
  "text_body",
  "raw_body",
  "body_preview",
  "attachment",
  "attachments",
  "payload",
  "raw_payload",
  "payload_text",
  "eml",
  "msg",
  "secret",
  "token",
  "password",
  "credential",
  "credentials",
  "cookie",
  "session",
]);

const SECRET_OR_RAW_PATH_RE = /(^|[/\\])\.env($|[/\\])|secret|token|password|credential|cookie|\.(eml|msg|hwp|hwpx|docx?|xlsx?|pptx?|pdf|zip)$/i;

function nowIso() {
  return new Date().toISOString();
}

function hashText(value, length = 12) {
  return createHash("sha1").update(String(value ?? "")).digest("hex").slice(0, length);
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value ?? "");
}

function idPart(value, fallbackPrefix = "id") {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._:-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
  return normalized || `${fallbackPrefix}-${hashText(value)}`;
}

function branchKeyFor(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return DEFAULT_BRANCH_KEY;
  return idPart(raw, "branch");
}

function strongBranchKeyFor(kind, anchorRef, label) {
  const raw = String(anchorRef || label || "").replace(/^[a-z_]+:/i, "");
  const key = idPart(raw, kind || "branch");
  return `${kind || "branch"}-${key}`;
}

function branchIdFor(projectCode, branchKey) {
  return branchKey ? `branch:${projectCode}:${branchKey}` : "";
}

function normalizeBranchKind(value) {
  const raw = String(value ?? "").trim().toLowerCase();
  return ["skeleton", "work", "history", "legacy"].includes(raw) ? raw : "";
}

function normalizeBranchStatus(value, fallback = "open") {
  const raw = String(value ?? "").trim().toLowerCase();
  if (["open", "closed", "proposed"].includes(raw)) return raw;
  if (/^(done|complete|completed|cancelled|canceled|rejected|dismissed)$/i.test(raw)) return "closed";
  return fallback;
}

function dateOnly(value) {
  const raw = String(value ?? "").trim();
  const match = /^\d{4}-\d{2}-\d{2}/.exec(raw);
  return match ? match[0] : "";
}

function daySpan(first, last) {
  const a = Date.parse(`${first}T00:00:00Z`);
  const b = Date.parse(`${last}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return 0;
  return Math.floor((b - a) / 86_400_000);
}

function hasHistoryWindow(days) {
  if (days.length < HISTORY_MIN_OCCURRENCES) return false;
  for (let i = 0; i <= days.length - HISTORY_MIN_OCCURRENCES; i += 1) {
    if (daySpan(days[i], days[i + HISTORY_MIN_OCCURRENCES - 1]) <= HISTORY_WINDOW_DAYS) return true;
  }
  return false;
}

function itemAnchorRef(event) {
  const raw = safeString(event.item_ref || event.item_id || event.task_key || event.core_item_id);
  if (!raw) return "";
  return raw.startsWith("item:") ? raw : `item:${raw}`;
}

function explicitAnchorRef(event) {
  return safeString(event.anchor_ref || event.stem_anchor_ref || event.branch_ref);
}

function skeletonAnchorRef(event, projectCode) {
  const explicit = explicitAnchorRef(event);
  if (explicit && !explicit.startsWith("branch:")) return explicit;
  const gate = safeString(event.anchor_stage_code || event.stage_code || event.stage_id);
  if (gate) return `gate:${gate}`;
  const group = safeString(event.deliverable_group_ref || event.deliverable_group || event.deliverable_ref);
  if (group) return `deliverable_group:${group}`;
  const mgmt = safeString(event.management_ref || event.mgmt_ref);
  if (mgmt) return `mgmt:${mgmt}`;
  return `project:${projectCode}`;
}

function isApprovedWorkEvent(event) {
  const reviewStatus = safeString(event.review_status).toLowerCase();
  return reviewStatus === "approved" || event.confirmed === true || event.confirm_event === true;
}

function resolveStemBranch(event, { projectCode, title, sourceRef, sourceTime }) {
  const explicitKind = normalizeBranchKind(event.branch_kind || event.stem_kind);
  const anchor = explicitAnchorRef(event);
  let branchKind = explicitKind;
  if (!branchKind && (anchor.startsWith("item:") || (itemAnchorRef(event) && isApprovedWorkEvent(event)))) branchKind = "work";
  if (!branchKind && anchor.startsWith("series:")) branchKind = "history";
  if (!branchKind && (anchor.startsWith("gate:") || anchor.startsWith("deliverable_group:") || anchor.startsWith("mgmt:"))) branchKind = "skeleton";

  const suggestedKey = branchKeyFor(safeString(event.branch_hint || event.branch_label));
  const suggestedBranchRef = suggestedKey === DEFAULT_BRANCH_KEY ? "" : `suggested:${projectCode}:${suggestedKey}`;

  if (!branchKind) {
    return {
      branchKind: "",
      branchKey: "",
      branchLabel: "",
      branchRef: "",
      suggestedBranchRef,
      anchorRef: "",
      branchStatus: "",
      bornAt: "",
      closedAt: "",
      seriesKey: "",
    };
  }

  let anchorRef = anchor;
  if (branchKind === "work") anchorRef = itemAnchorRef(event) || anchor || `item:${idPart(sourceRef, "source")}`;
  if (branchKind === "history") {
    const series = safeString(event.series_key) || idPart(normalizeThreadSubject(title), "series");
    anchorRef = anchor || `series:${series}`;
  }
  if (branchKind === "skeleton") anchorRef = skeletonAnchorRef(event, projectCode);

  const fallbackLabel = branchKind === "legacy"
    ? safeString(event.branch_hint || event.branch_label) || DEFAULT_BRANCH_LABEL
    : title;
  const branchLabel = safeString(event.branch_label || event.branch_hint) || fallbackLabel || DEFAULT_BRANCH_LABEL;
  const branchKey = branchKind === "legacy"
    ? branchKeyFor(branchLabel)
    : strongBranchKeyFor(branchKind, anchorRef, branchLabel);
  const closedAt = safeString(event.closed_at || event.done_at || event.completed_at);
  const branchStatus = normalizeBranchStatus(
    event.branch_status || event.status,
    branchKind === "history" ? "proposed" : (closedAt ? "closed" : "open"),
  );
  return {
    branchKind,
    branchKey,
    branchLabel,
    branchRef: branchIdFor(projectCode, branchKey),
    suggestedBranchRef,
    anchorRef,
    branchStatus,
    bornAt: safeString(event.born_at || event.created_at || sourceTime),
    closedAt,
    seriesKey: anchorRef.startsWith("series:") ? anchorRef.slice("series:".length) : "",
  };
}

function validateGeneratedAt(value) {
  const generatedAt = String(value || nowIso()).trim();
  if (!DATE_TIME_RE.test(generatedAt)) throw new Error(`invalid_generated_at:${value}`);
  return generatedAt;
}

function validateProjectCode(projectCode) {
  const project = String(projectCode ?? "").trim();
  if (!project || !SAFE_PROJECT_RE.test(project) || project.includes("..")) {
    throw new Error(`unsafe_project_code:${project || "(empty)"}`);
  }
  return project;
}

function safeProjectRoot(workmetaRoot, projectCode) {
  const project = validateProjectCode(projectCode);
  const root = resolve(workmetaRoot);
  const target = resolve(root, project);
  const rootPrefix = root.endsWith(sep) ? root : `${root}${sep}`;
  if (!target.startsWith(rootPrefix)) throw new Error(`project_path_escape:${project}`);
  return target;
}

function csvEscape(value) {
  let raw = String(value ?? "").normalize("NFC");
  if (/^[=+\-@\t\r]/.test(raw)) raw = `'${raw}`;
  return /[",\r\n]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cur += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        cur += c;
      }
    } else if (c === '"') {
      quoted = true;
    } else if (c === ",") {
      row.push(cur);
      cur = "";
    } else if (c === "\n") {
      row.push(cur);
      rows.push(row);
      row = [];
      cur = "";
    } else if (c === "\r") {
      if (text[i + 1] !== "\n") {
        row.push(cur);
        rows.push(row);
        row = [];
        cur = "";
      }
    } else {
      cur += c;
    }
  }
  if (cur !== "" || row.length) {
    row.push(cur);
    rows.push(row);
  }
  return rows;
}

function readCsvObjects(filePath, headers) {
  if (!existsSync(filePath)) return [];
  const records = parseCsv(readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
  const nonEmpty = records.filter((row) => row.some((cell) => String(cell ?? "").trim() !== ""));
  if (!nonEmpty.length) return [];
  const fileHeaders = nonEmpty[0].map((header) => String(header ?? "").trim());
  return nonEmpty.slice(1).map((record) => {
    const row = {};
    for (const header of headers) row[header] = "";
    fileHeaders.forEach((header, index) => {
      if (headers.includes(header)) row[header] = String(record[index] ?? "");
    });
    return row;
  });
}

function readCsvTable(filePath) {
  if (!existsSync(filePath)) return { headers: [], rows: [] };
  const records = parseCsv(readFileSync(filePath, "utf8").replace(/^\uFEFF/, "").normalize("NFC"))
    .filter((row) => row.some((cell) => String(cell ?? "").trim() !== ""));
  if (!records.length) return { headers: [], rows: [] };
  const headers = records[0].map((header) => String(header ?? "").trim().normalize("NFC"));
  return {
    headers,
    rows: records.slice(1).map((record) => {
      const row = {};
      headers.forEach((header, index) => {
        row[header] = String(record[index] ?? "").trim();
      });
      return row;
    }),
  };
}

function pickField(row, aliases) {
  for (const alias of aliases) {
    const value = row?.[alias];
    if (value != null && String(value).trim() !== "") return String(value).trim();
  }
  const normalizedAliases = new Set(aliases.map((alias) => String(alias).normalize("NFC").toLowerCase()));
  for (const [header, value] of Object.entries(row || {})) {
    if (normalizedAliases.has(String(header).normalize("NFC").toLowerCase()) && String(value ?? "").trim()) {
      return String(value).trim();
    }
  }
  return "";
}

const MAIL_FIELD_ALIASES = {
  key: ["\uC774\uB825\uD0A4", "history_key", "mail_history_key"],
  occurredAt: ["\uBA54\uC77C\uC218\uC2E0\uC2DC\uAC01", "\uBC1C\uC0DD\uC2DC\uAC01", "received_at", "source_time", "event_time"],
  title: ["\uC81C\uBAA9", "title", "subject"],
  sender: ["\uBC1C\uC2E0\uC790", "from", "sender"],
  thread: ["\uC2A4\uB808\uB4DC", "thread", "thread_key"],
  sourceId: ["\uBA54\uC77C\uC18C\uC2A4ID", "mail_source_id", "source_id"],
  eventType: ["\uC774\uBCA4\uD2B8\uC720\uD615", "event_type", "eventType"],
  mailbox: ["\uBA54\uC77C\uD568", "mailbox"],
};

const TASK_FIELD_ALIASES = {
  key: ["\uD560\uC77C\uD0A4", "task_key", "id"],
  createdAt: ["\uAE30\uB85D\uC77C", "created_at"],
  title: ["\uD560\uC77C\uBA85", "title"],
  assignee: ["\uB2F4\uB2F9\uC790", "assignee", "assignee_ref"],
  workType: ["\uC5C5\uBB34\uC720\uD615", "work_type"],
  status: ["\uC0C1\uD0DC", "status"],
  due: ["\uB9C8\uAC10\uC77C", "due", "due_date"],
  anchorStage: ["SE\uB2E8\uACC4", "anchor_stage_code", "stage_code"],
  linkKind: ["\uC5F0\uACB0\uC720\uD615", "link_kind"],
  linkRef: ["\uC5F0\uACB0\uB300\uC0C1", "link_ref"],
  completion: ["\uC644\uB8CC\uAE30\uC900", "completion_criteria"],
  sourceMail: ["\uAD00\uB828\uBA54\uC77C\uC774\uB825\uD0A4", "source_mail_ref", "origin_mail_id"],
  deliverableRef: ["\uC0B0\uCD9C\uBB3C\uCC38\uC870", "deliverable_ref"],
  reviewStatus: ["\uAC80\uD1A0\uC0C1\uD0DC", "review_status"],
  doneAt: ["\uC644\uB8CC\uC77C", "\uC644\uB8CC\uC2DC\uAC01", "done_at", "completed_at"],
};

function ledgerPointer(projectCode, relativePath, key) {
  const suffix = key ? `#${key}` : "";
  return join("_workmeta", projectCode, relativePath).replaceAll("\\", "/") + suffix;
}

function isClosedStatus(status) {
  return CLOSED_STATUS_RE.test(String(status ?? ""));
}

function isConfirmedWorkTask(row) {
  const key = pickField(row, TASK_FIELD_ALIASES.key);
  if (!key) return false;
  const status = pickField(row, TASK_FIELD_ALIASES.status);
  const reviewStatus = pickField(row, TASK_FIELD_ALIASES.reviewStatus).toLowerCase();
  if (UNCONFIRMED_STATUS_RE.test(`${status} ${reviewStatus}`)) return false;
  const hasAnchor = Boolean(
    pickField(row, TASK_FIELD_ALIASES.anchorStage)
    || pickField(row, TASK_FIELD_ALIASES.linkKind)
    || pickField(row, TASK_FIELD_ALIASES.linkRef)
    || pickField(row, TASK_FIELD_ALIASES.deliverableRef),
  );
  return hasAnchor || reviewStatus === "approved";
}

function buildTaskRebuildEvent(row, { projectCode }) {
  const key = pickField(row, TASK_FIELD_ALIASES.key);
  const status = pickField(row, TASK_FIELD_ALIASES.status);
  const title = pickField(row, TASK_FIELD_ALIASES.title) || key;
  const doneAt = pickField(row, TASK_FIELD_ALIASES.doneAt);
  return {
    source_kind: "task_ledger",
    source_id: key,
    external_ref: key,
    project_code: projectCode,
    title,
    branch_kind: "work",
    item_id: key,
    review_status: pickField(row, TASK_FIELD_ALIASES.reviewStatus) || "approved",
    status,
    anchor_stage_code: pickField(row, TASK_FIELD_ALIASES.anchorStage),
    link_kind: pickField(row, TASK_FIELD_ALIASES.linkKind),
    link_ref: pickField(row, TASK_FIELD_ALIASES.linkRef),
    created_at: pickField(row, TASK_FIELD_ALIASES.createdAt),
    born_at: pickField(row, TASK_FIELD_ALIASES.createdAt),
    closed_at: doneAt,
    done_at: doneAt,
    action_required: !isClosedStatus(status),
    work_type: pickField(row, TASK_FIELD_ALIASES.workType),
    completion_criteria: pickField(row, TASK_FIELD_ALIASES.completion),
    due: pickField(row, TASK_FIELD_ALIASES.due),
    suggested_actor_ref: pickField(row, TASK_FIELD_ALIASES.assignee),
    confidence: 0.8,
    pointer_ref: ledgerPointer(projectCode, TASK_LEDGER_RELATIVE_PATH, key),
    body_access: "metadata_only",
    summary_hint: [
      "stem_v2_rebuild task ledger rescan",
      pickField(row, TASK_FIELD_ALIASES.anchorStage) ? `stage=${pickField(row, TASK_FIELD_ALIASES.anchorStage)}` : "",
      pickField(row, TASK_FIELD_ALIASES.linkKind) ? `link_kind=${pickField(row, TASK_FIELD_ALIASES.linkKind)}` : "",
      "body_text_not_loaded",
    ].filter(Boolean).join("; "),
    reason: "stem_v2_rebuild task ledger rescan",
  };
}

function buildMailRebuildEvent(row, { projectCode, index }) {
  const key = pickField(row, MAIL_FIELD_ALIASES.key) || `mail-${index + 1}`;
  const title = pickField(row, MAIL_FIELD_ALIASES.title) || key;
  return {
    source_kind: "mail",
    source_id: `mailcsv:${key}`,
    external_ref: `mailcsv:${key}`,
    project_code: projectCode,
    received_at: pickField(row, MAIL_FIELD_ALIASES.occurredAt),
    title,
    subject: title,
    source_time: pickField(row, MAIL_FIELD_ALIASES.occurredAt),
    body_access: "metadata_only",
    confidence: 0.7,
    pointer_ref: ledgerPointer(projectCode, MAIL_LEDGER_RELATIVE_PATH, key),
    summary_hint: [
      "stem_v2_rebuild mail ledger rescan",
      pickField(row, MAIL_FIELD_ALIASES.eventType) ? `event_type=${pickField(row, MAIL_FIELD_ALIASES.eventType)}` : "",
      pickField(row, MAIL_FIELD_ALIASES.thread) ? "thread_key_present=true" : "",
      "body_text_not_loaded",
    ].filter(Boolean).join("; "),
    reason: "stem_v2_rebuild mail ledger rescan",
  };
}

function buildSkeletonRebuildEvents({ projectCode, taskRows }) {
  const events = [{
    source_kind: "project_meta",
    source_id: `stem-v2:${projectCode}:skeleton:project`,
    external_ref: `stem-v2:${projectCode}:skeleton:project`,
    project_code: projectCode,
    title: "Project skeleton",
    branch_label: "Project skeleton",
    branch_kind: "skeleton",
    anchor_ref: `project:${projectCode}`,
    body_access: "metadata_only",
    confidence: 1,
    reason: "stem_v2_rebuild skeleton seed",
  }];
  for (const seed of MGMT_SKELETON_SEEDS) {
    events.push({
      source_kind: "project_meta",
      source_id: `stem-v2:${projectCode}:skeleton:mgmt:${seed.ref}`,
      external_ref: `stem-v2:${projectCode}:skeleton:mgmt:${seed.ref}`,
      project_code: projectCode,
      title: seed.label,
      branch_label: seed.label,
      branch_kind: "skeleton",
      management_ref: seed.ref,
      body_access: "metadata_only",
      confidence: 1,
      reason: "stem_v2_rebuild management skeleton seed",
    });
  }
  const stageCodes = [...new Set(taskRows.map((row) => pickField(row, TASK_FIELD_ALIASES.anchorStage)).filter(Boolean))].sort();
  for (const stageCode of stageCodes) {
    events.push({
      source_kind: "project_meta",
      source_id: `stem-v2:${projectCode}:skeleton:gate:${stageCode}`,
      external_ref: `stem-v2:${projectCode}:skeleton:gate:${stageCode}`,
      project_code: projectCode,
      title: `Gate ${stageCode}`,
      branch_label: `Gate ${stageCode}`,
      branch_kind: "skeleton",
      anchor_stage_code: stageCode,
      body_access: "metadata_only",
      confidence: 1,
      reason: "stem_v2_rebuild gate skeleton seed",
    });
  }
  return events;
}

function writeCsvObjects(filePath, headers, rows) {
  mkdirSync(dirname(filePath), { recursive: true });
  const lines = [
    headers.map(csvEscape).join(","),
    ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(",")),
  ];
  const tmpPath = `${filePath}.tmp`;
  writeFileSync(tmpPath, `\uFEFF${lines.join("\n")}\n`, "utf8");
  renameSync(tmpPath, filePath);
}

function compactRow(row, headers) {
  const out = {};
  for (const header of headers) out[header] = String(row?.[header] ?? "");
  return out;
}

function mergeRows(existingRows, incomingRows, keyField, headers) {
  const map = new Map();
  for (const row of existingRows) {
    const key = String(row?.[keyField] ?? "").trim();
    if (key) map.set(key, compactRow(row, headers));
  }
  for (const row of incomingRows) {
    const key = String(row?.[keyField] ?? "").trim();
    if (!key) continue;
    const existing = map.get(key);
    if (existing) {
      map.set(key, compactRow({
        ...existing,
        ...row,
        created_at: existing.created_at || row.created_at,
      }, headers));
    } else {
      map.set(key, compactRow(row, headers));
    }
  }
  return [...map.values()].sort((a, b) => String(a[keyField]).localeCompare(String(b[keyField])));
}

function isUnsafePayloadKey(key) {
  const normalized = String(key ?? "").trim().toLowerCase();
  return FORBIDDEN_PAYLOAD_FIELDS.has(normalized) || normalized.includes(".env");
}

function findForbiddenFields(value, prefix = "") {
  const hits = [];
  if (!value || typeof value !== "object") return hits;
  if (Array.isArray(value)) {
    value.forEach((item, index) => hits.push(...findForbiddenFields(item, `${prefix}[${index}]`)));
    return hits;
  }
  for (const [key, nested] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (isUnsafePayloadKey(key)) hits.push(path);
    if (nested && typeof nested === "object") hits.push(...findForbiddenFields(nested, path));
  }
  return hits;
}

function safePointerRef(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  if (SECRET_OR_RAW_PATH_RE.test(raw)) return "";
  if (isAbsolute(raw) || /^[A-Za-z]:[\\/]/.test(raw) || /^\\\\/.test(raw)) return "";
  return raw;
}

function safeString(value) {
  return String(value ?? "").trim();
}

function normalizeConfidence(value) {
  if (value == null || value === "") return "";
  const n = Number(value);
  if (!Number.isFinite(n)) return "";
  return String(Math.max(0, Math.min(1, n)));
}

function lowConfidence(value) {
  if (value == null || value === "") return false;
  const n = Number(value);
  return Number.isFinite(n) && n < 0.65;
}

function sourceRefForEvent(event) {
  return safeString(event.external_ref || event.source_id || event.id || event.message_id || event.event_ref);
}

function sourceTimeForEvent(event) {
  return safeString(event.received_at || event.created_at || event.source_time || event.event_time);
}

function normalizeEvent(event, { projectCode, generatedAt, index }) {
  const forbiddenFields = findForbiddenFields(event);
  const sourceRef = sourceRefForEvent(event);
  const sourceKind = safeString(event.source_kind || event.kind);
  if (forbiddenFields.length) {
    return {
      skipped: true,
      skip: {
        index,
        source_hint: sourceRef || `event:${index + 1}`,
        reason: "unsafe_raw_or_secret_field",
        fields: forbiddenFields,
      },
    };
  }
  if (!sourceKind || !sourceRef) {
    return {
      skipped: true,
      skip: {
        index,
        source_hint: sourceRef || `event:${index + 1}`,
        reason: "missing_source_kind_or_ref",
        fields: [],
      },
    };
  }
  const eventProject = safeString(event.project_code || event.project_id);
  if (eventProject && eventProject !== projectCode) {
    return {
      skipped: true,
      skip: {
        index,
        source_hint: sourceRef,
        reason: "event_project_mismatch",
        fields: ["project_code"],
      },
    };
  }

  const title = safeString(event.title || event.subject || event.label) || `${sourceKind}:${sourceRef}`;
  const sourceTime = sourceTimeForEvent(event);
  const stemBranch = resolveStemBranch(event, { projectCode, title, sourceRef, sourceTime });
  const sourceId = `source:${idPart(sourceKind, "kind")}:${hashText(`${projectCode}\n${sourceKind}\n${sourceRef}`, 16)}`;
  const eventNodeId = `event:${hashText(`${projectCode}\n${sourceId}`, 16)}`;
  const taskNodeId = event.action_required === true
    ? `task:${hashText(`${projectCode}\n${sourceId}\ntask`, 16)}`
    : "";
  const milestoneLabel = safeString(event.milestone_label || event.milestone || event.milestone_ref);
  const milestoneNodeId = milestoneLabel
    ? `milestone:${hashText(`${projectCode}\n${milestoneLabel}`, 16)}`
    : "";
  const actorRef = safeString(event.suggested_actor_ref || event.actor_ref || event.team_ref);
  const actorNodeId = actorRef ? `actor:${hashText(actorRef, 16)}` : "";
  const metadata = {
    source_kind: sourceKind,
    source_ref: sourceRef,
    source_time: sourceTime,
    title,
    branch_key: stemBranch.branchKey,
    branch_ref: stemBranch.branchRef,
    suggested_branch_ref: stemBranch.suggestedBranchRef,
    branch_kind: stemBranch.branchKind,
    anchor_ref: stemBranch.anchorRef,
    branch_status: stemBranch.branchStatus,
    summary_hint: safeString(event.summary_hint),
    body_access: safeString(event.body_access || "metadata_only"),
    action_required: event.action_required === true,
    work_type: safeString(event.work_type),
    completion_criteria: safeString(event.completion_criteria),
    due: safeString(event.due),
    suggested_actor_ref: actorRef,
    confidence: normalizeConfidence(event.confidence),
    milestone_label: milestoneLabel,
  };
  return {
    skipped: false,
    generatedAt,
    projectCode,
    sourceId,
    eventNodeId,
    taskNodeId,
    milestoneNodeId,
    actorNodeId,
    sourceKind,
    sourceRef,
    sourceTime: metadata.source_time,
    title,
    branchKey: stemBranch.branchKey,
    branchLabel: stemBranch.branchLabel,
    branchKind: stemBranch.branchKind,
    branchRef: stemBranch.branchRef,
    suggestedBranchRef: stemBranch.suggestedBranchRef,
    anchorRef: stemBranch.anchorRef,
    branchStatus: stemBranch.branchStatus,
    bornAt: stemBranch.bornAt,
    closedAt: stemBranch.closedAt,
    seriesKey: stemBranch.seriesKey,
    summaryHint: metadata.summary_hint,
    pointerRef: safePointerRef(event.pointer_ref || event.source_pointer_ref || event.metadata_ref),
    bodyAccess: metadata.body_access || "metadata_only",
    actionRequired: event.action_required === true,
    workType: metadata.work_type,
    completionCriteria: metadata.completion_criteria,
    due: metadata.due,
    actorRef,
    confidence: metadata.confidence,
    reason: safeString(event.reason || event.judgment_reason) || "metadata_event_context_update",
    milestoneLabel,
    metadataHash: hashText(stableJson(metadata), 16),
  };
}

function makeNode({
  nodeId,
  projectCode,
  nodeType,
  label,
  branchKey = "",
  status = "active",
  sourceId = "",
  metadataHash = "",
  generatedAt,
}) {
  return {
    node_id: nodeId,
    project_code: projectCode,
    node_type: nodeType,
    label,
    branch_key: branchKey,
    status,
    source_id: sourceId,
    metadata_hash: metadataHash,
    created_at: generatedAt,
    updated_at: generatedAt,
  };
}

function makeEdge({ projectCode, fromNodeId, toNodeId, edgeType, sourceId, confidence = "", reason = "", generatedAt }) {
  return {
    edge_id: `edge:${hashText(`${projectCode}\n${fromNodeId}\n${edgeType}\n${toNodeId}`, 16)}`,
    project_code: projectCode,
    from_node_id: fromNodeId,
    to_node_id: toNodeId,
    edge_type: edgeType,
    source_id: sourceId,
    confidence,
    reason,
    created_at: generatedAt,
    updated_at: generatedAt,
  };
}

function makeBranch({ projectCode, branchKey, label, branchKind, anchorRef, status, bornAt, closedAt, generatedAt }) {
  return {
    branch_id: branchIdFor(projectCode, branchKey),
    project_code: projectCode,
    branch_key: branchKey,
    label,
    branch_kind: branchKind,
    anchor_ref: anchorRef,
    status,
    born_at: bornAt,
    closed_at: closedAt,
    updated_at: generatedAt,
  };
}

function makeReview({ projectCode, sourceId, taskNodeId, branchKey, reviewType, field, proposedValue, reason, generatedAt }) {
  return {
    review_id: `review:${hashText(`${projectCode}\n${sourceId}\n${reviewType}\n${field}`, 16)}`,
    project_code: projectCode,
    source_id: sourceId,
    task_node_id: taskNodeId,
    branch_key: branchKey,
    review_type: reviewType,
    field,
    proposed_value: proposedValue,
    reason,
    status: "open",
    created_at: generatedAt,
    updated_at: generatedAt,
  };
}

function addIfMissing(map, key, value) {
  if (!map.has(key)) map.set(key, value);
}

function rowsForEvent(event) {
  const projectNodeId = `project:${event.projectCode}`;
  const branchNodeId = event.branchRef;
  const nodes = new Map();
  const edges = new Map();
  const branches = [];
  const reviews = [];
  const operations = ["source_upsert"];

  addIfMissing(nodes, projectNodeId, makeNode({
    nodeId: projectNodeId,
    projectCode: event.projectCode,
    nodeType: "project_trunk",
    label: event.projectCode,
    status: "active",
    generatedAt: event.generatedAt,
  }));
  if (event.branchRef) {
    branches.push(makeBranch({
      projectCode: event.projectCode,
      branchKey: event.branchKey,
      label: event.branchLabel,
      branchKind: event.branchKind,
      anchorRef: event.anchorRef,
      status: event.branchStatus,
      bornAt: event.bornAt,
      closedAt: event.closedAt,
      generatedAt: event.generatedAt,
    }));
    addIfMissing(nodes, branchNodeId, makeNode({
      nodeId: branchNodeId,
      projectCode: event.projectCode,
      nodeType: "context_branch",
      label: event.branchLabel,
      branchKey: event.branchKey,
      status: event.branchStatus || "active",
      generatedAt: event.generatedAt,
    }));
    operations.push("branch_row_upsert", "branch_node_upsert");
  }
  addIfMissing(nodes, event.eventNodeId, makeNode({
    nodeId: event.eventNodeId,
    projectCode: event.projectCode,
    nodeType: "source_event",
    label: event.title,
    branchKey: event.branchKey,
    sourceId: event.sourceId,
    metadataHash: event.metadataHash,
    generatedAt: event.generatedAt,
  }));
  operations.push("project_node_upsert", "event_node_upsert");

  const stemEdges = event.branchRef
    ? [
      makeEdge({
        projectCode: event.projectCode,
        fromNodeId: branchNodeId,
        toNodeId: projectNodeId,
        edgeType: "belongs_to",
        sourceId: event.sourceId,
        confidence: event.confidence,
        reason: "branch belongs to project trunk",
        generatedAt: event.generatedAt,
      }),
      makeEdge({
        projectCode: event.projectCode,
        fromNodeId: event.eventNodeId,
        toNodeId: branchNodeId,
        edgeType: "on_branch",
        sourceId: event.sourceId,
        confidence: event.confidence,
        reason: "source event assigned to context branch",
        generatedAt: event.generatedAt,
      }),
    ]
    : [
      makeEdge({
        projectCode: event.projectCode,
        fromNodeId: event.eventNodeId,
        toNodeId: projectNodeId,
        edgeType: "on_project",
        sourceId: event.sourceId,
        confidence: event.confidence,
        reason: "unanchored source event remains on project trunk",
        generatedAt: event.generatedAt,
      }),
    ];
  for (const edge of stemEdges) edges.set(edge.edge_id, edge);
  operations.push(event.branchRef ? "branch_edge_upsert" : "project_event_edge_upsert");

  if (event.actionRequired) {
    const taskLabelParts = [event.title];
    if (event.workType) taskLabelParts.push(`[${event.workType}]`);
    addIfMissing(nodes, event.taskNodeId, makeNode({
      nodeId: event.taskNodeId,
      projectCode: event.projectCode,
      nodeType: "task_candidate",
      label: taskLabelParts.join(" "),
      branchKey: event.branchKey,
      status: "candidate",
      sourceId: event.sourceId,
      metadataHash: event.metadataHash,
      generatedAt: event.generatedAt,
    }));
    const edge = makeEdge({
      projectCode: event.projectCode,
      fromNodeId: event.eventNodeId,
      toNodeId: event.taskNodeId,
      edgeType: "creates_task",
      sourceId: event.sourceId,
      confidence: event.confidence,
      reason: "action_required metadata created a task candidate node",
      generatedAt: event.generatedAt,
    });
    edges.set(edge.edge_id, edge);
    operations.push("task_node_upsert", "creates_task_edge_upsert");
  }

  if (event.milestoneNodeId) {
    addIfMissing(nodes, event.milestoneNodeId, makeNode({
      nodeId: event.milestoneNodeId,
      projectCode: event.projectCode,
      nodeType: "milestone",
      label: event.milestoneLabel,
      branchKey: event.branchKey,
      status: "active",
      sourceId: event.sourceId,
      metadataHash: event.metadataHash,
      generatedAt: event.generatedAt,
    }));
    const edge = makeEdge({
      projectCode: event.projectCode,
      fromNodeId: event.milestoneNodeId,
      toNodeId: branchNodeId,
      edgeType: "on_branch",
      sourceId: event.sourceId,
      confidence: event.confidence,
      reason: "milestone attached to context branch",
      generatedAt: event.generatedAt,
    });
    edges.set(edge.edge_id, edge);
    operations.push("milestone_node_upsert", "milestone_branch_edge_upsert");
  }

  if (event.actorNodeId) {
    addIfMissing(nodes, event.actorNodeId, makeNode({
      nodeId: event.actorNodeId,
      projectCode: event.projectCode,
      nodeType: "actor",
      label: event.actorRef,
      branchKey: "",
      status: "suggested",
      sourceId: event.sourceId,
      metadataHash: event.metadataHash,
      generatedAt: event.generatedAt,
    }));
    if (event.taskNodeId) {
      const edge = makeEdge({
        projectCode: event.projectCode,
        fromNodeId: event.taskNodeId,
        toNodeId: event.actorNodeId,
        edgeType: "suggested_owner",
        sourceId: event.sourceId,
        confidence: event.confidence,
        reason: "event metadata suggested a responsible actor",
        generatedAt: event.generatedAt,
      });
      edges.set(edge.edge_id, edge);
    }
    operations.push("actor_node_upsert", "suggested_owner_edge_upsert");
  }

  if (event.due && event.taskNodeId) {
    reviews.push(makeReview({
      projectCode: event.projectCode,
      sourceId: event.sourceId,
      taskNodeId: event.taskNodeId,
      branchKey: event.branchKey,
      reviewType: "due_date_confirmation",
      field: "due",
      proposedValue: event.due,
      reason: "due date affects schedule and needs owner-visible confirmation",
      generatedAt: event.generatedAt,
    }));
    operations.push("review_due_enqueue");
  }

  if (event.actorRef && event.taskNodeId) {
    reviews.push(makeReview({
      projectCode: event.projectCode,
      sourceId: event.sourceId,
      taskNodeId: event.taskNodeId,
      branchKey: event.branchKey,
      reviewType: "assignee_confirmation",
      field: "suggested_actor_ref",
      proposedValue: event.actorRef,
      reason: "assignee suggestion stays reviewable before final responsibility",
      generatedAt: event.generatedAt,
    }));
    operations.push("review_assignee_enqueue");
  }

  if (lowConfidence(event.confidence)) {
    reviews.push(makeReview({
      projectCode: event.projectCode,
      sourceId: event.sourceId,
      taskNodeId: event.taskNodeId,
      branchKey: event.branchKey,
      reviewType: "confidence_review",
      field: "confidence",
      proposedValue: event.confidence,
      reason: "low confidence context linkage should be checked",
      generatedAt: event.generatedAt,
    }));
    operations.push("review_confidence_enqueue");
  }

  const source = {
    source_id: event.sourceId,
    project_code: event.projectCode,
    source_kind: event.sourceKind,
    external_ref: event.sourceRef,
    source_time: event.sourceTime,
    title: event.title,
    branch_key: event.branchKey,
    branch_ref: event.branchRef,
    suggested_branch_ref: event.suggestedBranchRef,
    summary_hint: event.summaryHint,
    pointer_ref: event.pointerRef,
    metadata_hash: event.metadataHash,
    body_access: event.bodyAccess || "metadata_only",
    created_at: event.generatedAt,
    updated_at: event.generatedAt,
  };
  const judgment = {
    judgment_id: `judgment:${hashText(`${event.projectCode}\n${event.sourceId}\ncontext_update`, 16)}`,
    project_code: event.projectCode,
    source_id: event.sourceId,
    judgment_type: "metadata_context_update",
    operations: JSON.stringify([...new Set(operations)]),
    confidence: event.confidence,
    reason: event.reason,
    raw_payload_copied: "false",
    created_at: event.generatedAt,
    updated_at: event.generatedAt,
  };

  return {
    branches,
    occurrences: [],
    sources: [source],
    nodes: [...nodes.values()],
    edges: [...edges.values()],
    judgments: [judgment],
    reviewQueue: reviews,
  };
}

function countRows(rowsByKind) {
  return {
    branches: rowsByKind.branches.length,
    occurrences: rowsByKind.occurrences.length,
    sources: rowsByKind.sources.length,
    nodes: rowsByKind.nodes.length,
    edges: rowsByKind.edges.length,
    judgments: rowsByKind.judgments.length,
    review_queue: rowsByKind.reviewQueue.length,
  };
}

function emptyRowsByKind() {
  return {
    branches: [],
    occurrences: [],
    sources: [],
    nodes: [],
    edges: [],
    judgments: [],
    reviewQueue: [],
  };
}

function appendRows(target, rows) {
  target.branches.push(...rows.branches);
  target.occurrences.push(...rows.occurrences);
  target.sources.push(...rows.sources);
  target.nodes.push(...rows.nodes);
  target.edges.push(...rows.edges);
  target.judgments.push(...rows.judgments);
  target.reviewQueue.push(...rows.reviewQueue);
}

function applyHistoryStemCandidates(events, { projectCode }) {
  const groups = new Map();
  for (const event of events) {
    if (event.branchKind || event.sourceKind !== "mail") continue;
    const subjectKey = normalizeThreadSubject(event.title);
    const day = dateOnly(event.sourceTime);
    if (!subjectKey || !day) continue;
    const group = groups.get(subjectKey) || { events: [], days: new Set(), firstTitle: event.title };
    group.events.push(event);
    group.days.add(day);
    groups.set(subjectKey, group);
  }

  for (const [subjectKey, group] of groups) {
    const days = [...group.days].sort();
    if (group.events.length < HISTORY_MIN_OCCURRENCES) continue;
    if (!hasHistoryWindow(days)) continue;
    const seriesKey = idPart(subjectKey, "series");
    const anchorRef = `series:${seriesKey}`;
    const branchKey = strongBranchKeyFor("history", anchorRef, group.firstTitle);
    const branchRef = branchIdFor(projectCode, branchKey);
    for (const event of group.events) {
      event.branchKind = "history";
      event.branchKey = branchKey;
      event.branchLabel = `History: ${group.firstTitle}`;
      event.branchRef = branchRef;
      event.anchorRef = anchorRef;
      event.branchStatus = "proposed";
      event.bornAt = days[0];
      event.closedAt = "";
      event.seriesKey = seriesKey;
    }
  }
}

function historyOccurrenceRows(events, generatedAt) {
  const byKey = new Map();
  for (const event of events) {
    if (event.branchKind !== "history" || !event.seriesKey || !event.branchRef) continue;
    const day = dateOnly(event.sourceTime);
    if (!day) continue;
    const key = `${event.projectCode}\0${event.seriesKey}\0${day}`;
    const row = byKey.get(key) || {
      occurrence_id: `occurrence:${hashText(`${event.projectCode}\n${event.seriesKey}\n${day}`, 16)}`,
      project_code: event.projectCode,
      series_key: event.seriesKey,
      occurrence_key: day,
      branch_ref: event.branchRef,
      source_count: "0",
      spawned_item_refs: "",
      created_at: generatedAt,
      updated_at: generatedAt,
      spawned: new Set(),
    };
    row.source_count = String(Number(row.source_count) + 1);
    if (event.anchorRef?.startsWith("item:")) row.spawned.add(event.anchorRef);
    byKey.set(key, row);
  }
  return [...byKey.values()].map(({ spawned, ...row }) => ({
    ...row,
    spawned_item_refs: [...spawned].sort().join(";"),
  })).sort((a, b) => a.series_key.localeCompare(b.series_key) || a.occurrence_key.localeCompare(b.occurrence_key));
}

function loadExistingContext(projectRoot) {
  return {
    branches: readCsvObjects(join(projectRoot, PROJECT_CONTEXT_FILES.branches), CSV_HEADERS.branches),
    occurrences: readCsvObjects(join(projectRoot, PROJECT_CONTEXT_FILES.occurrences), CSV_HEADERS.occurrences),
    sources: readCsvObjects(join(projectRoot, PROJECT_CONTEXT_FILES.sources), CSV_HEADERS.sources),
    nodes: readCsvObjects(join(projectRoot, PROJECT_CONTEXT_FILES.nodes), CSV_HEADERS.nodes),
    edges: readCsvObjects(join(projectRoot, PROJECT_CONTEXT_FILES.edges), CSV_HEADERS.edges),
    judgments: readCsvObjects(join(projectRoot, PROJECT_CONTEXT_FILES.judgments), CSV_HEADERS.judgments),
    reviewQueue: readCsvObjects(join(projectRoot, PROJECT_CONTEXT_FILES.reviewQueue), CSV_HEADERS.reviewQueue),
  };
}

function mergeContext(existing, incoming) {
  return {
    branches: mergeRows(existing.branches, incoming.branches, "branch_id", CSV_HEADERS.branches),
    occurrences: mergeRows(existing.occurrences, incoming.occurrences, "occurrence_id", CSV_HEADERS.occurrences),
    sources: mergeRows(existing.sources, incoming.sources, "source_id", CSV_HEADERS.sources),
    nodes: mergeRows(existing.nodes, incoming.nodes, "node_id", CSV_HEADERS.nodes),
    edges: mergeRows(existing.edges, incoming.edges, "edge_id", CSV_HEADERS.edges),
    judgments: mergeRows(existing.judgments, incoming.judgments, "judgment_id", CSV_HEADERS.judgments),
    reviewQueue: mergeRows(existing.reviewQueue, incoming.reviewQueue, "review_id", CSV_HEADERS.reviewQueue),
  };
}

function summarizeBranches(projectCode, context, generatedAt) {
  const branchRows = context.branches
    .map((branch) => ({
      branch_id: branch.branch_id || branchIdFor(projectCode, branch.branch_key),
      project_code: projectCode,
      branch_key: branch.branch_key || DEFAULT_BRANCH_KEY,
      label: branch.label || branch.branch_key || DEFAULT_BRANCH_LABEL,
      branch_kind: branch.branch_kind || "legacy",
      anchor_ref: branch.anchor_ref || "",
      status: branch.status || "open",
      born_at: branch.born_at || "",
      closed_at: branch.closed_at || "",
      source_count: "0",
      task_count: "0",
      open_review_count: "0",
      updated_at: generatedAt,
    }));
  const branchNodes = context.nodes
    .filter((node) => node.node_type === "context_branch")
    .map((node) => ({
      branch_id: node.node_id,
      project_code: projectCode,
      branch_key: node.branch_key || DEFAULT_BRANCH_KEY,
      label: node.label || node.branch_key || DEFAULT_BRANCH_LABEL,
      branch_kind: "legacy",
      anchor_ref: "",
      status: node.status || "open",
      born_at: node.created_at || "",
      closed_at: "",
      source_count: "0",
      task_count: "0",
      open_review_count: "0",
      updated_at: generatedAt,
    }));
  const byKey = new Map([...branchNodes, ...branchRows].map((row) => [row.branch_key, row]));
  for (const source of context.sources) {
    const key = source.branch_key || DEFAULT_BRANCH_KEY;
    if (!key || key === DEFAULT_BRANCH_KEY) continue;
    if (!byKey.has(key)) {
      byKey.set(key, {
        branch_id: `branch:${projectCode}:${key}`,
        project_code: projectCode,
        branch_key: key,
        label: key,
        branch_kind: "legacy",
        anchor_ref: "",
        status: "open",
        born_at: "",
        closed_at: "",
        source_count: "0",
        task_count: "0",
        open_review_count: "0",
        updated_at: generatedAt,
      });
    }
    byKey.get(key).source_count = String(Number(byKey.get(key).source_count) + 1);
  }
  for (const node of context.nodes) {
    if (node.node_type !== "task_candidate") continue;
    const key = node.branch_key || DEFAULT_BRANCH_KEY;
    if (byKey.has(key)) byKey.get(key).task_count = String(Number(byKey.get(key).task_count) + 1);
  }
  for (const review of context.reviewQueue) {
    if (review.status && review.status !== "open") continue;
    const key = review.branch_key || DEFAULT_BRANCH_KEY;
    if (byKey.has(key)) byKey.get(key).open_review_count = String(Number(byKey.get(key).open_review_count) + 1);
  }
  return [...byKey.values()].sort((a, b) => a.branch_key.localeCompare(b.branch_key));
}

function renderProjectSummary({ projectCode, generatedAt, context, branchSummaries }) {
  const openReviews = context.reviewQueue.filter((row) => !row.status || row.status === "open").length;
  const lines = [];
  lines.push(`# ${projectCode} project_context summary`);
  lines.push("");
  lines.push(`schema_version: ${SCHEMA_VERSION}`);
  lines.push(`generated_at: ${generatedAt}`);
  lines.push("body_access: metadata_only");
  lines.push("raw_payload_copied: false");
  lines.push("");
  lines.push("## Totals");
  lines.push("");
  lines.push(`- branches: ${context.branches.length}`);
  lines.push(`- occurrences: ${context.occurrences.length}`);
  lines.push(`- sources: ${context.sources.length}`);
  lines.push(`- nodes: ${context.nodes.length}`);
  lines.push(`- edges: ${context.edges.length}`);
  lines.push(`- judgments: ${context.judgments.length}`);
  lines.push(`- open_reviews: ${openReviews}`);
  lines.push("");
  lines.push("## Branches");
  lines.push("");
  if (!branchSummaries.length) {
    lines.push("- none");
  } else {
    for (const row of branchSummaries) {
      lines.push(`- ${row.label} (${row.branch_key}): sources=${row.source_count}, tasks=${row.task_count}, open_reviews=${row.open_review_count}`);
    }
  }
  lines.push("");
  return `${lines.join("\n")}`;
}

export function buildProjectContextPlan({
  workmetaRoot = DEFAULT_WORKMETA_ROOT,
  projectCode,
  projectId,
  events = [],
  generatedAt = nowIso(),
} = {}) {
  const project = validateProjectCode(projectCode || projectId);
  const checkedGeneratedAt = validateGeneratedAt(generatedAt);
  const rows = emptyRowsByKind();
  const acceptedEvents = [];
  const rawBoundarySkips = [];

  events.forEach((event, index) => {
    const normalized = normalizeEvent(event || {}, {
      projectCode: project,
      generatedAt: checkedGeneratedAt,
      index,
    });
    if (normalized.skipped) {
      rawBoundarySkips.push(normalized.skip);
      return;
    }
    acceptedEvents.push(normalized);
  });
  applyHistoryStemCandidates(acceptedEvents, { projectCode: project });
  for (const event of acceptedEvents) appendRows(rows, rowsForEvent(event));
  rows.occurrences.push(...historyOccurrenceRows(acceptedEvents, checkedGeneratedAt));

  return {
    schema_version: SCHEMA_VERSION,
    project_code: project,
    generated_at: checkedGeneratedAt,
    context_root: join(resolve(workmetaRoot), project, CONTEXT_RELATIVE_PATH),
    body_access: "metadata_only",
    raw_payload_copied: false,
    input_event_count: events.length,
    accepted_event_count: acceptedEvents.length,
    skipped_event_count: rawBoundarySkips.length,
    raw_boundary_skips: rawBoundarySkips,
    incoming_counts: countRows(rows),
    rows,
  };
}

export function applyProjectContextPlan(plan, {
  workmetaRoot = DEFAULT_WORKMETA_ROOT,
} = {}) {
  const projectRoot = safeProjectRoot(workmetaRoot, plan.project_code);
  const existing = loadExistingContext(projectRoot);
  const merged = mergeContext(existing, plan.rows);
  const branchSummaries = summarizeBranches(plan.project_code, merged, plan.generated_at);
  const summary = renderProjectSummary({
    projectCode: plan.project_code,
    generatedAt: plan.generated_at,
    context: merged,
    branchSummaries,
  });

  writeCsvObjects(join(projectRoot, PROJECT_CONTEXT_FILES.branches), CSV_HEADERS.branches, merged.branches);
  writeCsvObjects(join(projectRoot, PROJECT_CONTEXT_FILES.occurrences), CSV_HEADERS.occurrences, merged.occurrences);
  writeCsvObjects(join(projectRoot, PROJECT_CONTEXT_FILES.sources), CSV_HEADERS.sources, merged.sources);
  writeCsvObjects(join(projectRoot, PROJECT_CONTEXT_FILES.nodes), CSV_HEADERS.nodes, merged.nodes);
  writeCsvObjects(join(projectRoot, PROJECT_CONTEXT_FILES.edges), CSV_HEADERS.edges, merged.edges);
  writeCsvObjects(join(projectRoot, PROJECT_CONTEXT_FILES.judgments), CSV_HEADERS.judgments, merged.judgments);
  writeCsvObjects(join(projectRoot, PROJECT_CONTEXT_FILES.reviewQueue), CSV_HEADERS.reviewQueue, merged.reviewQueue);
  writeCsvObjects(join(projectRoot, PROJECT_CONTEXT_FILES.branchSummaries), CSV_HEADERS.branchSummaries, branchSummaries);
  mkdirSync(dirname(join(projectRoot, PROJECT_CONTEXT_FILES.projectSummary)), { recursive: true });
  writeFileSync(join(projectRoot, PROJECT_CONTEXT_FILES.projectSummary), summary, "utf8");

  return {
    total_counts: {
      sources: merged.sources.length,
      branches: merged.branches.length,
      occurrences: merged.occurrences.length,
      nodes: merged.nodes.length,
      edges: merged.edges.length,
      judgments: merged.judgments.length,
      review_queue: merged.reviewQueue.length,
      branch_summaries: branchSummaries.length,
    },
    files_written: [
      PROJECT_CONTEXT_FILES.branches,
      PROJECT_CONTEXT_FILES.occurrences,
      PROJECT_CONTEXT_FILES.sources,
      PROJECT_CONTEXT_FILES.nodes,
      PROJECT_CONTEXT_FILES.edges,
      PROJECT_CONTEXT_FILES.judgments,
      PROJECT_CONTEXT_FILES.reviewQueue,
      PROJECT_CONTEXT_FILES.branchSummaries,
      PROJECT_CONTEXT_FILES.projectSummary,
    ],
  };
}

export const buildProjectContextUpsertPlan = buildProjectContextPlan;
export const applyProjectContextUpsertPlan = applyProjectContextPlan;

export function runProjectContextUpdate({
  workmetaRoot = DEFAULT_WORKMETA_ROOT,
  projectCode,
  projectId,
  events = [],
  generatedAt = nowIso(),
  apply = false,
} = {}) {
  const plan = buildProjectContextPlan({
    workmetaRoot,
    projectCode: projectCode || projectId,
    events,
    generatedAt,
  });
  const report = {
    schema_version: plan.schema_version,
    project_code: plan.project_code,
    generated_at: plan.generated_at,
    apply: Boolean(apply),
    context_root: plan.context_root,
    body_access: plan.body_access,
    raw_payload_copied: plan.raw_payload_copied,
    input_event_count: plan.input_event_count,
    accepted_event_count: plan.accepted_event_count,
    skipped_event_count: plan.skipped_event_count,
    raw_boundary_skips: plan.raw_boundary_skips,
    incoming_counts: plan.incoming_counts,
    total_counts: null,
    files_written: [],
  };
  if (apply) {
    const applied = applyProjectContextPlan(plan, { workmetaRoot });
    report.total_counts = applied.total_counts;
    report.files_written = applied.files_written;
  }
  return report;
}

export function buildProjectContextRebuildEvents({
  workmetaRoot = DEFAULT_WORKMETA_ROOT,
  projectCode,
  projectId,
} = {}) {
  const project = validateProjectCode(projectCode || projectId);
  const projectRoot = safeProjectRoot(workmetaRoot, project);
  const taskLedgerPath = join(projectRoot, TASK_LEDGER_RELATIVE_PATH);
  const mailLedgerPath = join(projectRoot, MAIL_LEDGER_RELATIVE_PATH);
  const taskTable = readCsvTable(taskLedgerPath);
  const mailTable = readCsvTable(mailLedgerPath);
  const workTaskRows = taskTable.rows.filter(isConfirmedWorkTask);
  const skeletonEvents = buildSkeletonRebuildEvents({ projectCode: project, taskRows: taskTable.rows });
  const workEvents = workTaskRows.map((row) => buildTaskRebuildEvent(row, { projectCode: project }));
  const mailEvents = mailTable.rows.map((row, index) => buildMailRebuildEvent(row, { projectCode: project, index }));
  return {
    project_code: project,
    mode: "rebuild_from_ledgers",
    input_refs: {
      task_ledger: ledgerPointer(project, TASK_LEDGER_RELATIVE_PATH, ""),
      mail_ledger: ledgerPointer(project, MAIL_LEDGER_RELATIVE_PATH, ""),
    },
    counts: {
      task_rows: taskTable.rows.length,
      mail_rows: mailTable.rows.length,
      skeleton_events: skeletonEvents.length,
      work_events: workEvents.length,
      mail_events: mailEvents.length,
      total_events: skeletonEvents.length + workEvents.length + mailEvents.length,
    },
    events: [...skeletonEvents, ...workEvents, ...mailEvents],
  };
}

export function runProjectContextRebuild({
  workmetaRoot = DEFAULT_WORKMETA_ROOT,
  projectCode,
  projectId,
  generatedAt = nowIso(),
  apply = false,
} = {}) {
  const rebuild = buildProjectContextRebuildEvents({
    workmetaRoot,
    projectCode: projectCode || projectId,
  });
  const report = runProjectContextUpdate({
    workmetaRoot,
    projectCode: rebuild.project_code,
    events: rebuild.events,
    generatedAt,
    apply,
  });
  return {
    ...report,
    mode: rebuild.mode,
    rebuild_input_refs: rebuild.input_refs,
    rebuild_counts: rebuild.counts,
  };
}

function readInputJson(inputRef) {
  const rawRef = String(inputRef ?? "").trim();
  if (!rawRef) throw new Error("--input_required");
  let jsonText = rawRef;
  const pathRef = rawRef.startsWith("@") ? rawRef.slice(1) : rawRef;
  const maybePath = resolve(process.cwd(), pathRef);
  const looksLikeInlineJson = rawRef.startsWith("[") || rawRef.startsWith("{");
  if (!looksLikeInlineJson && existsSync(maybePath)) {
    const ext = extname(maybePath).toLowerCase();
    if (ext !== ".json") throw new Error(`unsafe_input_file_extension:${ext || "(none)"}`);
    if (SECRET_OR_RAW_PATH_RE.test(maybePath)) throw new Error("unsafe_input_file_path");
    jsonText = readFileSync(maybePath, "utf8");
  } else if (rawRef.startsWith("@")) {
    throw new Error(`input_file_not_found:${pathRef}`);
  }
  const parsed = JSON.parse(jsonText);
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed?.events)) return parsed.events;
  throw new Error("input_json_must_be_array_or_events_object");
}

function readValue(argv, index, token) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${token}_requires_value`);
  return value;
}

function parseArgs(argv) {
  const opts = {
    workmetaRoot: DEFAULT_WORKMETA_ROOT,
    projectCode: "",
    inputRef: "",
    rebuildFromLedgers: false,
    generatedAt: nowIso(),
    apply: false,
    json: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--help" || token === "-h") {
      opts.help = true;
    } else if (token === "--json") {
      opts.json = true;
    } else if (token === "--apply") {
      opts.apply = true;
    } else if (token === "--dry-run") {
      opts.apply = false;
    } else if (token === "--rebuild-from-ledgers" || token === "--rebuild") {
      opts.rebuildFromLedgers = true;
    } else if (token === "--workmeta-root" || token === "--workmeta") {
      opts.workmetaRoot = readValue(argv, i, token);
      i += 1;
    } else if (token === "--project") {
      opts.projectCode = readValue(argv, i, token);
      i += 1;
    } else if (token === "--input" || token === "--events") {
      opts.inputRef = readValue(argv, i, token);
      i += 1;
    } else if (token === "--generated-at") {
      opts.generatedAt = validateGeneratedAt(readValue(argv, i, token));
      i += 1;
    } else {
      throw new Error(`unknown_arg:${token}`);
    }
  }
  return opts;
}

function usage() {
  return [
    "Usage: node tools/haengbogwan_project_context.mjs --project <code> (--input <json-or-json-file> | --rebuild-from-ledgers) [--workmeta-root <dir>] [--generated-at <iso>] [--apply] [--dry-run] [--json]",
    "",
    "Creates or updates _workmeta/<project>/project_context metadata state.",
    "Dry-run is the default. --apply writes sources/nodes/edges/judgments/review_queue and summaries.",
    "--events is accepted as an alias for --input.",
    "--rebuild-from-ledgers rescans reports/mail and task ledgers once, seeding skeleton/work/history stem-v2 metadata without reading bodies or attachments.",
    "Input JSON must be an array or {\"events\":[...]}; raw body, attachment, payload, secret, and credential fields are skipped.",
  ].join("\n");
}

export function main(argv = process.argv.slice(2), { stdout = process.stdout, stderr = process.stderr } = {}) {
  try {
    const opts = parseArgs(argv);
    if (opts.help) {
      stdout.write(`${usage()}\n`);
      return 0;
    }
    if (!opts.projectCode) throw new Error("--project_required");
    const report = opts.rebuildFromLedgers
      ? runProjectContextRebuild({
        workmetaRoot: opts.workmetaRoot,
        projectCode: opts.projectCode,
        generatedAt: opts.generatedAt,
        apply: opts.apply,
      })
      : runProjectContextUpdate({
        workmetaRoot: opts.workmetaRoot,
        projectCode: opts.projectCode,
        events: readInputJson(opts.inputRef),
        generatedAt: opts.generatedAt,
        apply: opts.apply,
      });
    stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return 0;
  } catch (error) {
    stderr.write(`[haengbogwan_project_context] ${error.message}\n`);
    return 2;
  }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
  process.exitCode = main();
}

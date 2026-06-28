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

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..", "..", "..", "..");
const DEFAULT_WORKMETA_ROOT = join(REPO, "_workmeta");
const SAFE_PROJECT_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const DATE_TIME_RE = /^\d{4}-\d{2}-\d{2}(?:[T ][0-9:.+\-Z]+)?$/;
const SCHEMA_VERSION = "soulforge.project_context.v0";

const CONTEXT_RELATIVE_PATH = "project_context";
const SUMMARY_RELATIVE_PATH = join(CONTEXT_RELATIVE_PATH, "summaries");
const DEFAULT_BRANCH_KEY = "unclassified";
const DEFAULT_BRANCH_LABEL = "Unclassified";

export const PROJECT_CONTEXT_FILES = {
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
    "source_count",
    "task_count",
    "open_review_count",
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

  const branchLabel = safeString(event.branch_hint || event.branch_label) || DEFAULT_BRANCH_LABEL;
  const branchKey = branchKeyFor(branchLabel);
  const title = safeString(event.title || event.subject || event.label) || `${sourceKind}:${sourceRef}`;
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
    source_time: sourceTimeForEvent(event),
    title,
    branch_key: branchKey,
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
    branchKey,
    branchLabel,
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
  const branchNodeId = `branch:${event.projectCode}:${event.branchKey}`;
  const nodes = new Map();
  const edges = new Map();
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
  addIfMissing(nodes, branchNodeId, makeNode({
    nodeId: branchNodeId,
    projectCode: event.projectCode,
    nodeType: "context_branch",
    label: event.branchLabel,
    branchKey: event.branchKey,
    status: "active",
    generatedAt: event.generatedAt,
  }));
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
  operations.push("project_node_upsert", "branch_node_upsert", "event_node_upsert");

  for (const edge of [
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
  ]) edges.set(edge.edge_id, edge);
  operations.push("branch_edge_upsert", "event_branch_edge_upsert");

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
    sources: [source],
    nodes: [...nodes.values()],
    edges: [...edges.values()],
    judgments: [judgment],
    reviewQueue: reviews,
  };
}

function countRows(rowsByKind) {
  return {
    sources: rowsByKind.sources.length,
    nodes: rowsByKind.nodes.length,
    edges: rowsByKind.edges.length,
    judgments: rowsByKind.judgments.length,
    review_queue: rowsByKind.reviewQueue.length,
  };
}

function emptyRowsByKind() {
  return {
    sources: [],
    nodes: [],
    edges: [],
    judgments: [],
    reviewQueue: [],
  };
}

function appendRows(target, rows) {
  target.sources.push(...rows.sources);
  target.nodes.push(...rows.nodes);
  target.edges.push(...rows.edges);
  target.judgments.push(...rows.judgments);
  target.reviewQueue.push(...rows.reviewQueue);
}

function loadExistingContext(projectRoot) {
  return {
    sources: readCsvObjects(join(projectRoot, PROJECT_CONTEXT_FILES.sources), CSV_HEADERS.sources),
    nodes: readCsvObjects(join(projectRoot, PROJECT_CONTEXT_FILES.nodes), CSV_HEADERS.nodes),
    edges: readCsvObjects(join(projectRoot, PROJECT_CONTEXT_FILES.edges), CSV_HEADERS.edges),
    judgments: readCsvObjects(join(projectRoot, PROJECT_CONTEXT_FILES.judgments), CSV_HEADERS.judgments),
    reviewQueue: readCsvObjects(join(projectRoot, PROJECT_CONTEXT_FILES.reviewQueue), CSV_HEADERS.reviewQueue),
  };
}

function mergeContext(existing, incoming) {
  return {
    sources: mergeRows(existing.sources, incoming.sources, "source_id", CSV_HEADERS.sources),
    nodes: mergeRows(existing.nodes, incoming.nodes, "node_id", CSV_HEADERS.nodes),
    edges: mergeRows(existing.edges, incoming.edges, "edge_id", CSV_HEADERS.edges),
    judgments: mergeRows(existing.judgments, incoming.judgments, "judgment_id", CSV_HEADERS.judgments),
    reviewQueue: mergeRows(existing.reviewQueue, incoming.reviewQueue, "review_id", CSV_HEADERS.reviewQueue),
  };
}

function summarizeBranches(projectCode, context, generatedAt) {
  const branchNodes = context.nodes
    .filter((node) => node.node_type === "context_branch")
    .map((node) => ({
      branch_id: node.node_id,
      project_code: projectCode,
      branch_key: node.branch_key || DEFAULT_BRANCH_KEY,
      label: node.label || node.branch_key || DEFAULT_BRANCH_LABEL,
      source_count: "0",
      task_count: "0",
      open_review_count: "0",
      updated_at: generatedAt,
    }));
  const byKey = new Map(branchNodes.map((row) => [row.branch_key, row]));
  for (const source of context.sources) {
    const key = source.branch_key || DEFAULT_BRANCH_KEY;
    if (!byKey.has(key)) {
      byKey.set(key, {
        branch_id: `branch:${projectCode}:${key}`,
        project_code: projectCode,
        branch_key: key,
        label: key,
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
    appendRows(rows, rowsForEvent(normalized));
  });

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
      nodes: merged.nodes.length,
      edges: merged.edges.length,
      judgments: merged.judgments.length,
      review_queue: merged.reviewQueue.length,
      branch_summaries: branchSummaries.length,
    },
    files_written: [
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
    "Usage: node tools/haengbogwan_project_context.mjs --project <code> --input <json-or-json-file> [--workmeta-root <dir>] [--generated-at <iso>] [--apply] [--dry-run] [--json]",
    "",
    "Creates or updates _workmeta/<project>/project_context metadata state.",
    "Dry-run is the default. --apply writes sources/nodes/edges/judgments/review_queue and summaries.",
    "--events is accepted as an alias for --input.",
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
    const events = readInputJson(opts.inputRef);
    const report = runProjectContextUpdate({
      workmetaRoot: opts.workmetaRoot,
      projectCode: opts.projectCode,
      events,
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

import crypto from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { appendJsonl, normalizeRepoPath, pathExists } from "../shared/io.mjs";

export const KNOWLEDGE_ACCESS_EVENT_SCHEMA_VERSION = "soulforge.knowledge_access_event.v0";
export const KNOWLEDGE_ACCESS_WORKFLOW_ID = "knowledge_access_event_capture_v0";

export const CAPTURE_MODES = new Set([
  "manual_agent_entry",
  "router_appended",
  "search_tool_appended",
  "workflow_appended",
  "imported_log_entry",
]);

export const ACTOR_TYPES = new Set(["workflow", "skill", "mission", "user", "tool", "advisory_handoff"]);

export const ACCESS_TYPES = new Set([
  "read",
  "cite",
  "summarize",
  "route",
  "promote",
  "compare",
  "validate",
  "advisory_handoff",
  "graph_update",
  "retention_review",
]);

export const OUTCOME_STATES = new Set([
  "useful",
  "partially_useful",
  "not_useful",
  "blocked",
  "routed",
  "promoted",
  "superseded",
  "unknown",
]);

const BLOCKED_KNOWLEDGE_ROOTS = [
  "_workmeta",
  "_workspaces",
  "private-state",
  "guild_hall/state",
  ".git",
  "node_modules",
];

const ALLOWED_REPO_LEDGER_ROOTS = ["_workmeta/", "guild_hall/state/", "private-state/"];
const SECRET_EXTENSIONS = new Set([".age", ".gpg", ".key", ".kdbx", ".p12", ".pem", ".pfx", ".pgp"]);
const SECRET_BASENAME_PATTERN =
  /(^\.env($|\.)|(^|[._-])(id_rsa|id_dsa|id_ecdsa|id_ed25519|token|password|passwd|secret|credential|credentials|cookie|session|authorization|auth)([._-]|$)|^\.npmrc$|^\.pypirc$)/i;
const SECRET_TEXT_PATTERN =
  /\b(token|password|passwd|secret|cookie|session|authorization)\s*[:=]\s*["']?[^"',\s)]+/gi;
const EMBEDDED_WINDOWS_ABSOLUTE_PATH_PATTERN = /(?:^|[\s"'`([{<])(?:[A-Za-z]:[\\/][^\s"'`)\]}>,;]*)/;
const EMBEDDED_WINDOWS_UNC_PATH_PATTERN = /(?:^|[\s"'`([{<])(?:\\\\[^\\/\s"'`)\]}>,;]+[\\/][^\s"'`)\]}>,;]*)/;
const EMBEDDED_POSIX_RUNTIME_PATH_PATTERN =
  /(?:^|[\s"'`([{<])\/(?:Users|home|tmp|var|etc|opt|mnt|Volumes|workspace|workspaces|Soulforge|repo)(?:\/[^\s"'`)\]}>,;]*)?/i;

export async function readKnowledgeRefAndRecord(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const knowledgeRef = normalizeKnowledgeRef(options.knowledgeRef ?? options.ref);
  const targetPath = resolveKnowledgePath(repoRoot, knowledgeRef);

  if (!(await pathExists(targetPath))) {
    throw new Error(`knowledge_ref_not_found: ${knowledgeRef}`);
  }

  const stat = await fs.stat(targetPath);
  if (!stat.isFile()) {
    throw new Error(`knowledge_ref_must_be_file: ${knowledgeRef}`);
  }

  const appendResult = await appendKnowledgeAccessEvent({
    ...options,
    repoRoot,
    knowledgeRef,
    accessType: options.accessType ?? "read",
  });
  const content = await fs.readFile(targetPath, "utf8");

  return {
    ...appendResult,
    content,
  };
}

export async function recordKnowledgeAccess(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const knowledgeRef = normalizeKnowledgeRef(options.knowledgeRef ?? options.ref);

  return appendKnowledgeAccessEvent({
    ...options,
    repoRoot,
    knowledgeRef,
    accessType: options.accessType ?? "cite",
  });
}

export async function appendKnowledgeAccessEvent(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const now = normalizeNow(options.now);
  const ledger = resolveLedgerTarget({
    repoRoot,
    ledgerRoot: options.ledgerRoot,
    ledgerFile: options.ledgerFile,
    now,
  });
  const event = buildKnowledgeAccessEvent({
    ...options,
    repoRoot,
    now,
    ledgerRef: options.ledgerRef ?? ledger.ledger_ref,
  });
  const validation = validateKnowledgeAccessEvent(event);

  if (!validation.ok) {
    throw new Error(`knowledge_access_event_invalid: ${validation.errors.join("; ")}`);
  }

  await appendJsonl(ledger.path, event);

  return {
    event,
    ledger_path: ledger.path,
    ledger_ref: ledger.ledger_ref,
  };
}

export function buildKnowledgeAccessEvent(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const now = normalizeNow(options.now);
  const timestampUtc = formatTimestampUtc(now);
  const knowledgeRef = normalizeKnowledgeRef(options.knowledgeRef ?? options.ref);
  const actor = normalizeActor(options);
  const captureMode = requireAllowed(
    options.captureMode ?? options.capture_mode ?? "manual_agent_entry",
    CAPTURE_MODES,
    "capture_mode",
  );
  const accessType = requireAllowed(options.accessType ?? options.access_type ?? "read", ACCESS_TYPES, "access_type");
  const outcomeState = requireAllowed(
    options.outcomeState ?? options.outcome_state ?? "unknown",
    OUTCOME_STATES,
    "outcome_state",
  );
  const ledgerRef = sanitizeMetadataText(options.ledgerRef ?? options.ledger_ref ?? "knowledge_access_ledger", "ledger_ref", 240);
  const workContext = normalizeWorkContext(options);
  const target = {
    knowledge_ref: knowledgeRef,
    target_type: sanitizeMetadataText(options.targetType ?? options.target_type ?? "knowledge_node", "target_type", 120),
    source_workflow_id: sanitizeNullableRef(options.sourceWorkflowId ?? options.source_workflow_id),
  };
  const eventBase = {
    schema_version: KNOWLEDGE_ACCESS_EVENT_SCHEMA_VERSION,
    workflow_id: KNOWLEDGE_ACCESS_WORKFLOW_ID,
    kind: "knowledge_access_event",
    status: "recorded",
    timestamp_utc: timestampUtc,
    capture_mode: captureMode,
    ledger_ref: ledgerRef,
    event_source_ref: sanitizeNullableRef(options.eventSourceRef ?? options.event_source_ref),
    manual_agent_note: sanitizeNullableText(options.manualAgentNote ?? options.manual_agent_note, "manual_agent_note", 500),
    actor,
    target,
    access_type: accessType,
    reason_used: sanitizeMetadataText(options.reasonUsed ?? options.reason_used ?? "knowledge ref used", "reason_used", 500),
    output_ref: sanitizeNullableRef(options.outputRef ?? options.output_ref),
    work_context: workContext,
    outcome_state: outcomeState,
    usefulness: {
      state: outcomeState,
      score_hint_0_to_3: normalizeScoreHint(options.usefulnessScoreHint ?? options.usefulness_score_hint),
      note_ref: sanitizeNullableRef(options.usefulnessNoteRef ?? options.usefulness_note_ref),
    },
    relation_hints: {
      relation_type_hint: sanitizeNullableText(options.relationTypeHint ?? options.relation_type_hint, "relation_type_hint", 120),
      relevance_score_hint_0_to_3: normalizeScoreHint(options.relevanceScoreHint ?? options.relevance_score_hint),
      strength_hint: sanitizeNullableText(options.strengthHint ?? options.strength_hint, "strength_hint", 80),
      confidence_hint_0_to_3: normalizeScoreHint(options.confidenceHint ?? options.confidence_hint),
      duplicate_or_redundant_with: normalizeRefList(options.duplicateOrRedundantWith ?? options.duplicate_or_redundant_with),
      orphan_reason_hint: sanitizeNullableText(options.orphanReasonHint ?? options.orphan_reason_hint, "orphan_reason_hint", 240),
    },
    redaction: {
      metadata_only: true,
      manual_agent_note_payload_free: true,
      payload_copied: false,
      secret_present: false,
      runtime_absolute_path_present: false,
    },
  };

  return {
    ...eventBase,
    event_id: buildEventId({ ...eventBase, repo_root: repoRoot }),
  };
}

export function validateKnowledgeAccessEvent(event) {
  const errors = [];

  if (!event || typeof event !== "object" || Array.isArray(event)) {
    return { ok: false, errors: ["event must be an object"] };
  }

  for (const key of [
    "event_id",
    "timestamp_utc",
    "capture_mode",
    "ledger_ref",
    "actor",
    "target",
    "access_type",
    "reason_used",
    "work_context",
    "outcome_state",
    "redaction",
  ]) {
    if (!(key in event)) {
      errors.push(`missing required field: ${key}`);
    }
  }

  if (!/^knowledge_access_\d{8}T\d{6}Z_[a-f0-9]{12}$/.test(String(event.event_id ?? ""))) {
    errors.push("event_id must use the knowledge_access timestamp/hash shape");
  }
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(String(event.timestamp_utc ?? ""))) {
    errors.push("timestamp_utc must be second-precision UTC");
  }
  if (!CAPTURE_MODES.has(event.capture_mode)) {
    errors.push(`capture_mode is not allowed: ${event.capture_mode}`);
  }
  if (!ACTOR_TYPES.has(event.actor?.type)) {
    errors.push(`actor.type is not allowed: ${event.actor?.type}`);
  }
  if (!event.actor?.id) {
    errors.push("actor.id is required");
  }
  try {
    normalizeKnowledgeRef(event.target?.knowledge_ref);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }
  if (!ACCESS_TYPES.has(event.access_type)) {
    errors.push(`access_type is not allowed: ${event.access_type}`);
  }
  if (!OUTCOME_STATES.has(event.outcome_state)) {
    errors.push(`outcome_state is not allowed: ${event.outcome_state}`);
  }
  if (event.redaction?.metadata_only !== true) {
    errors.push("redaction.metadata_only must be true");
  }
  if (event.redaction?.payload_copied !== false) {
    errors.push("redaction.payload_copied must be false");
  }
  if (event.redaction?.secret_present !== false) {
    errors.push("redaction.secret_present must be false");
  }
  if (event.redaction?.runtime_absolute_path_present !== false) {
    errors.push("redaction.runtime_absolute_path_present must be false");
  }

  return {
    ok: errors.length === 0,
    errors,
  };
}

export function normalizeKnowledgeRef(value) {
  const raw = requireNonEmptyText(value, "knowledge_ref");

  if (raw.includes("\0")) {
    throw new Error("knowledge_ref_contains_null_byte");
  }
  if (/^[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(raw)) {
    throw new Error("knowledge_ref_must_be_repo_relative");
  }
  if (path.isAbsolute(raw) || path.win32.isAbsolute(raw) || path.posix.isAbsolute(raw)) {
    throw new Error("knowledge_ref_must_be_repo_relative");
  }
  if (/^[A-Za-z]:/.test(raw)) {
    throw new Error("knowledge_ref_must_be_repo_relative");
  }

  const normalized = raw.replaceAll("\\", "/");
  const parts = normalized.split("/");

  if (parts.some((part) => part === "" || part === "." || part === "..")) {
    throw new Error("knowledge_ref_must_not_use_path_traversal");
  }
  if (normalized !== path.posix.normalize(normalized)) {
    throw new Error("knowledge_ref_must_be_normalized");
  }

  const lowered = normalized.toLowerCase();
  for (const blockedRoot of BLOCKED_KNOWLEDGE_ROOTS) {
    if (lowered === blockedRoot || lowered.startsWith(`${blockedRoot}/`)) {
      throw new Error(`knowledge_ref_root_blocked: ${blockedRoot}`);
    }
  }

  const basename = path.posix.basename(lowered);
  const extension = path.posix.extname(basename);
  if (SECRET_EXTENSIONS.has(extension) || SECRET_BASENAME_PATTERN.test(basename)) {
    throw new Error("knowledge_ref_secret_like_path_blocked");
  }

  return normalized;
}

export function resolveLedgerTarget({ repoRoot = process.cwd(), ledgerRoot, ledgerFile, now = new Date() } = {}) {
  if ((ledgerRoot && ledgerFile) || (!ledgerRoot && !ledgerFile)) {
    throw new Error("provide exactly one of ledgerRoot or ledgerFile");
  }

  const root = path.resolve(repoRoot);
  const resolvedNow = normalizeNow(now);
  const stamps = buildDateStamps(resolvedNow);
  const filePath = ledgerFile
    ? path.resolve(String(ledgerFile))
    : path.join(path.resolve(String(ledgerRoot)), "events", stamps.year, `${stamps.yearMonth}.jsonl`);

  if (path.extname(filePath).toLowerCase() !== ".jsonl") {
    throw new Error("ledger_file_must_be_jsonl");
  }

  assertLedgerWriteBoundary(root, filePath);

  return {
    path: filePath,
    ledger_ref: buildLedgerRef({
      repoRoot: root,
      ledgerRoot: ledgerRoot ? path.resolve(String(ledgerRoot)) : null,
      ledgerFile: filePath,
    }),
  };
}

function resolveKnowledgePath(repoRoot, knowledgeRef) {
  const absolutePath = path.resolve(repoRoot, knowledgeRef);
  if (!isSubpath(repoRoot, absolutePath)) {
    throw new Error("knowledge_ref_resolves_outside_repo");
  }
  return absolutePath;
}

function assertLedgerWriteBoundary(repoRoot, ledgerFile) {
  if (!isSubpath(repoRoot, ledgerFile)) {
    return;
  }

  const repoRelative = normalizeRepoPath(path.relative(repoRoot, ledgerFile));
  const allowed = ALLOWED_REPO_LEDGER_ROOTS.some((allowedRoot) => repoRelative.startsWith(allowedRoot));

  if (!allowed) {
    throw new Error("ledger_target_inside_repo_must_be_private_metadata_or_local_state");
  }
}

function buildLedgerRef({ repoRoot, ledgerRoot, ledgerFile }) {
  if (isSubpath(repoRoot, ledgerFile)) {
    return normalizeRepoPath(path.relative(repoRoot, ledgerFile));
  }
  if (ledgerRoot && isSubpath(ledgerRoot, ledgerFile)) {
    const relative = normalizeRepoPath(path.relative(ledgerRoot, ledgerFile));
    return `ledger_root:${relative}`;
  }
  return `ledger_file:${path.basename(ledgerFile)}`;
}

function normalizeActor(options) {
  return {
    type: requireAllowed(options.actorType ?? options.actor_type ?? "tool", ACTOR_TYPES, "actor.type"),
    id: sanitizeMetadataText(options.actorId ?? options.actor_id ?? "codex", "actor.id", 120),
    ref: sanitizeNullableRef(options.actorRef ?? options.actor_ref),
  };
}

function normalizeWorkContext(options) {
  return {
    task_ref: sanitizeNullableRef(options.taskRef ?? options.task_ref),
    run_ref: sanitizeNullableRef(options.runRef ?? options.run_ref),
    workflow_id: sanitizeNullableText(options.workflowId ?? options.workflow_id, "workflow_id", 120),
    skill_id: sanitizeNullableText(options.skillId ?? options.skill_id, "skill_id", 120),
    mission_id: sanitizeNullableText(options.missionId ?? options.mission_id, "mission_id", 120),
    advisory_handoff_ref: sanitizeNullableRef(options.advisoryHandoffRef ?? options.advisory_handoff_ref),
  };
}

function sanitizeNullableRef(value) {
  return sanitizeNullableText(value, "ref", 240);
}

function sanitizeNullableText(value, key, maxLength) {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  return sanitizeMetadataText(value, key, maxLength);
}

function sanitizeMetadataText(value, key, maxLength) {
  const text = requireNonEmptyText(value, key).replace(/\s+/g, " ");
  const redacted = text.replace(SECRET_TEXT_PATTERN, (match, label) => `${label ?? "secret"}=[redacted]`);
  if (containsRuntimeAbsolutePath(redacted)) {
    throw new Error(`${key}_must_not_be_absolute_path`);
  }
  if (redacted.length <= maxLength) {
    return redacted;
  }
  return `${redacted.slice(0, Math.max(0, maxLength - 15))}... [truncated]`;
}

function containsRuntimeAbsolutePath(value) {
  return (
    path.isAbsolute(value) ||
    path.win32.isAbsolute(value) ||
    path.posix.isAbsolute(value) ||
    /^[A-Za-z]:/.test(value) ||
    EMBEDDED_WINDOWS_ABSOLUTE_PATH_PATTERN.test(value) ||
    EMBEDDED_WINDOWS_UNC_PATH_PATTERN.test(value) ||
    EMBEDDED_POSIX_RUNTIME_PATH_PATTERN.test(value)
  );
}

function normalizeRefList(value) {
  if (value === undefined || value === null || value === "") {
    return [];
  }
  const values = Array.isArray(value) ? value : String(value).split(",");
  return values.map((item) => sanitizeNullableRef(item)).filter(Boolean).slice(0, 20);
}

function normalizeScoreHint(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 3) {
    throw new Error("score_hint_must_be_0_to_3");
  }
  return parsed;
}

function requireAllowed(value, allowed, key) {
  const text = requireNonEmptyText(value, key);
  if (!allowed.has(text)) {
    throw new Error(`${key}_not_allowed: ${text}`);
  }
  return text;
}

function requireNonEmptyText(value, key) {
  const text = typeof value === "string" ? value.trim() : value === undefined || value === null ? "" : String(value).trim();
  if (!text) {
    throw new Error(`missing_required_field: ${key}`);
  }
  return text;
}

function normalizeNow(value) {
  if (value instanceof Date) {
    return value;
  }
  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }
  return new Date();
}

function formatTimestampUtc(value) {
  return value.toISOString().replace(/\.\d{3}Z$/, "Z");
}

function buildDateStamps(value) {
  const timestamp = formatTimestampUtc(value);
  return {
    year: timestamp.slice(0, 4),
    yearMonth: timestamp.slice(0, 7),
    compact: `${timestamp.slice(0, 10).replaceAll("-", "")}T${timestamp.slice(11, 19).replaceAll(":", "")}Z`,
  };
}

function buildEventId(event) {
  const stamps = buildDateStamps(new Date(event.timestamp_utc));
  const hash = crypto.createHash("sha256").update(stableStringify(event)).digest("hex").slice(0, 12);
  return `knowledge_access_${stamps.compact}_${hash}`;
}

function isSubpath(root, candidate) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function stableStringify(value) {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
}

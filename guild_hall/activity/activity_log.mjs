import { promises as fs } from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import {
  appendJsonl,
  normalizeRepoPath,
  pathExists,
  relativeToRepoOrAbsolute,
  writeJson,
} from "../shared/io.mjs";

export const ACTIVITY_EVENT_SCHEMA_VERSION = "soulforge.activity.event.v1";
export const LATEST_CONTEXT_SCHEMA_VERSION = "soulforge.activity.latest_context.v1";
export const DEFAULT_RECENT_COUNT = 12;
export const DEFAULT_MAX_EVENT_READ = 200;

const SENSITIVE_KEY_PATTERN =
  /(raw|body|html|token|password|passwd|secret|cookie|session|credential|authorization|attachment_binary|attachment_content)/i;
const SECRET_TEXT_PATTERNS = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  /\b(Bearer)\s+[A-Za-z0-9._~+/=-]{12,}/gi,
  /\b(token|password|passwd|secret|cookie|session|authorization)\s*[:=]\s*["']?[^"',\s)]+/gi,
];
const HTML_BODY_PATTERN = /<!doctype html|<html[\s>]|<body[\s>]|<\/body>|<\/html>/i;

export function defaultActivityRoot(repoRoot) {
  return path.join(repoRoot, "guild_hall", "state", "operations", "soulforge_activity");
}

export async function appendActivityEvent(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const activityRoot = path.resolve(options.activityRoot ?? defaultActivityRoot(repoRoot));
  const now = options.now instanceof Date ? options.now : new Date();
  const identity = options.identity ?? (await loadNodeIdentity(repoRoot));
  const event = buildActivityEvent(options.input ?? {}, { repoRoot, identity, now });
  const stamps = buildDateStamps(now);
  const eventsPath = path.join(activityRoot, "events", stamps.year, `${stamps.yearMonth}.jsonl`);

  await appendJsonl(eventsPath, event);
  const latestContext = await refreshLatestContext({
    activityRoot,
    now,
    defaultRecentCount: options.defaultRecentCount,
  });

  return {
    event,
    events_path: eventsPath,
    latest_context_path: path.join(activityRoot, "latest_context.json"),
    latest_context: latestContext,
  };
}

export function buildActivityEvent(input = {}, context = {}) {
  const repoRoot = path.resolve(context.repoRoot ?? process.cwd());
  const now = context.now instanceof Date ? context.now : new Date();
  const identity = normalizeIdentity(context.identity);
  const stamps = buildDateStamps(now);
  const entryId = sanitizeShortId(
    input.entry_id ?? `activity_${stamps.compact}_${crypto.randomBytes(4).toString("hex")}`,
    "entry_id",
  );
  const refs = normalizeRefs(input.refs, repoRoot);

  return {
    schema_version: ACTIVITY_EVENT_SCHEMA_VERSION,
    entry_id: entryId,
    occurred_at: now.toISOString(),
    date: stamps.date,
    node_id: identity.node_id,
    node_role: identity.node_role,
    actor: sanitizeShortText(input.actor ?? identity.node_id, "actor", 120),
    scope: sanitizeShortId(requireText(input.scope, "scope"), "scope"),
    project_code: sanitizeShortId(input.project_code ?? input["project-code"] ?? "shared", "project_code"),
    action: sanitizeShortId(requireText(input.action, "action"), "action"),
    result: sanitizeShortId(input.result ?? "recorded", "result"),
    summary: sanitizeShortText(requireText(input.summary, "summary"), "summary", 500),
    refs,
    detail_owner: sanitizeShortText(input.detail_owner ?? input["detail-owner"] ?? null, "detail_owner", 240),
    next_action: sanitizeShortText(input.next_action ?? input["next-action"] ?? null, "next_action", 360),
    carry_forward: parseBoolean(input.carry_forward ?? input["carry-forward"], false),
    sensitive_content_included: false,
    sanitizer_version: "soulforge.activity.sanitizer.v1",
  };
}

export async function refreshLatestContext(options = {}) {
  const activityRoot = path.resolve(options.activityRoot ?? defaultActivityRoot(process.cwd()));
  const now = options.now instanceof Date ? options.now : new Date();
  const defaultRecentCount = normalizeRecentCount(options.defaultRecentCount);
  const events = await readRecentActivityEvents({
    activityRoot,
    limit: Math.max(DEFAULT_MAX_EVENT_READ, defaultRecentCount),
  });
  const recentEntries = events.slice(0, defaultRecentCount).map(toRecentEntry);
  const openThreads = events
    .filter((event) => event?.carry_forward === true)
    .slice(0, defaultRecentCount)
    .map(toRecentEntry);
  const latestContext = {
    version: LATEST_CONTEXT_SCHEMA_VERSION,
    updated_on: now.toISOString(),
    default_recent_count: defaultRecentCount,
    open_threads: openThreads,
    recent_entries: recentEntries,
  };
  const latestContextPath = path.join(activityRoot, "latest_context.json");

  await writeJson(latestContextPath, latestContext);
  return latestContext;
}

export async function readRecentActivityEvents(options = {}) {
  const activityRoot = path.resolve(options.activityRoot ?? defaultActivityRoot(process.cwd()));
  const limit = normalizeRecentCount(options.limit ?? DEFAULT_MAX_EVENT_READ, DEFAULT_MAX_EVENT_READ);
  const eventFiles = await collectEventFiles(path.join(activityRoot, "events"));
  const events = [];

  for (const eventFile of eventFiles.reverse()) {
    const raw = await fs.readFile(eventFile, "utf8");
    const lines = raw.split(/\r?\n/).filter(Boolean);

    for (let index = lines.length - 1; index >= 0; index -= 1) {
      try {
        const parsed = JSON.parse(lines[index]);
        if (parsed && typeof parsed === "object") {
          events.push(parsed);
        }
      } catch {
        // Skip malformed historical rows; the append-only ledger remains untouched.
      }

      if (events.length >= limit) {
        return sortEventsNewestFirst(events).slice(0, limit);
      }
    }
  }

  return sortEventsNewestFirst(events).slice(0, limit);
}

export async function loadNodeIdentity(repoRoot) {
  const identityPath = path.join(repoRoot, "guild_hall", "state", "local", "node_identity.yaml");

  if (!(await pathExists(identityPath))) {
    return normalizeIdentity({});
  }

  try {
    const parsed = parseYaml(await fs.readFile(identityPath, "utf8"));
    return normalizeIdentity(parsed);
  } catch {
    return normalizeIdentity({});
  }
}

export function sanitizeActivityValue(value, key = "value", maxLength = 500) {
  if (value === null || value === undefined) {
    return null;
  }

  if (SENSITIVE_KEY_PATTERN.test(key)) {
    return "[redacted:sensitive-field]";
  }

  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item) => sanitizeActivityValue(item, key, maxLength));
  }

  if (typeof value === "object") {
    const next = {};
    for (const [entryKey, entryValue] of Object.entries(value).slice(0, 40)) {
      next[entryKey] = sanitizeActivityValue(entryValue, entryKey, maxLength);
    }
    return next;
  }

  const text = String(value).replace(/\s+/g, " ").trim();
  if (HTML_BODY_PATTERN.test(text) && text.length > 80) {
    return "[redacted:possible-raw-html]";
  }

  const redacted = SECRET_TEXT_PATTERNS.reduce(
    (current, pattern) => current.replace(pattern, (match, label) => `${label ?? "secret"}=[redacted]`),
    text,
  );

  if (redacted.length <= maxLength) {
    return redacted;
  }

  return `${redacted.slice(0, maxLength - 15)}... [truncated]`;
}

export function buildDateStamps(value) {
  const year = `${value.getFullYear()}`;
  const month = `${value.getMonth() + 1}`.padStart(2, "0");
  const day = `${value.getDate()}`.padStart(2, "0");
  const hour = `${value.getHours()}`.padStart(2, "0");
  const minute = `${value.getMinutes()}`.padStart(2, "0");
  const second = `${value.getSeconds()}`.padStart(2, "0");
  const millisecond = `${value.getMilliseconds()}`.padStart(3, "0");

  return {
    year,
    date: `${year}-${month}-${day}`,
    yearMonth: `${year}-${month}`,
    time: `${hour}${minute}`,
    timeSecond: `${hour}${minute}${second}`,
    compact: `${year}${month}${day}T${hour}${minute}${second}${millisecond}`,
  };
}

function requireText(value, key) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) {
    throw new Error(`Missing required activity field: ${key}`);
  }
  return text;
}

function sanitizeShortId(value, key) {
  const text = sanitizeActivityValue(value, key, 160);
  const normalized = String(text ?? "")
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^A-Za-z0-9_.:@/-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");

  return normalized || "unknown";
}

function sanitizeShortText(value, key, maxLength) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  return sanitizeActivityValue(value, key, maxLength);
}

function normalizeRefs(value, repoRoot) {
  const values = Array.isArray(value)
    ? value.flatMap((item) => String(item).split(","))
    : typeof value === "string"
      ? value.split(",")
      : [];

  return values
    .map((item) => String(item).trim())
    .filter(Boolean)
    .slice(0, 20)
    .map((item) => sanitizeRef(item, repoRoot));
}

function sanitizeRef(value, repoRoot) {
  const redacted = sanitizeActivityValue(value, "ref", 240);
  const maybePath = path.resolve(repoRoot, redacted);
  if (path.isAbsolute(redacted)) {
    return relativeToRepoOrAbsolute(repoRoot, redacted);
  }
  if (!redacted.includes("://") && !redacted.startsWith("#")) {
    return normalizeRepoPath(path.relative(repoRoot, maybePath));
  }
  return redacted;
}

function parseBoolean(value, fallback) {
  if (value === true || value === false) {
    return value;
  }
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "n", "off"].includes(normalized)) {
    return false;
  }
  return fallback;
}

function normalizeRecentCount(value, fallback = DEFAULT_RECENT_COUNT) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }
  return Math.min(parsed, 200);
}

function normalizeIdentity(value) {
  const identity = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return {
    node_id: sanitizeShortId(identity.node_id ?? "unknown_node", "node_id"),
    node_role: sanitizeShortId(identity.node_role ?? "unknown_role", "node_role"),
    bootstrap_profile: sanitizeShortId(identity.bootstrap_profile ?? "unknown_profile", "bootstrap_profile"),
  };
}

async function collectEventFiles(eventsRoot) {
  if (!(await pathExists(eventsRoot))) {
    return [];
  }

  const files = [];
  const stack = [eventsRoot];

  while (stack.length > 0) {
    const current = stack.pop();
    const entries = await fs.readdir(current, { withFileTypes: true });

    for (const entry of entries) {
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(entryPath);
      } else if (entry.isFile() && entry.name.endsWith(".jsonl")) {
        files.push(entryPath);
      }
    }
  }

  return files.sort();
}

function sortEventsNewestFirst(events) {
  return [...events].sort((left, right) => {
    const leftTime = Date.parse(left?.occurred_at ?? left?.date ?? "");
    const rightTime = Date.parse(right?.occurred_at ?? right?.date ?? "");
    const leftSafe = Number.isFinite(leftTime) ? leftTime : 0;
    const rightSafe = Number.isFinite(rightTime) ? rightTime : 0;
    if (rightSafe !== leftSafe) {
      return rightSafe - leftSafe;
    }
    return String(right?.entry_id ?? "").localeCompare(String(left?.entry_id ?? ""));
  });
}

function toRecentEntry(event) {
  return {
    entry_id: event.entry_id,
    date: event.date,
    occurred_at: event.occurred_at ?? null,
    node_id: event.node_id ?? null,
    node_role: event.node_role ?? null,
    scope: event.scope,
    project_code: event.project_code ?? "shared",
    action: event.action ?? null,
    result: event.result ?? null,
    summary: event.summary,
    refs: Array.isArray(event.refs) ? event.refs : [],
    next_action: event.next_action ?? null,
    carry_forward: event.carry_forward === true,
  };
}

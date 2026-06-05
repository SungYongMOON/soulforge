import { promises as fs } from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { appendJsonl, pathExists } from "../shared/io.mjs";

export const BATTLE_EVENT_SCHEMA_ID = "soulforge.workspace.battle_event.v0";
export const DEFAULT_LATEST_COUNT = 12;

const REQUIRED_FIELDS = [
  "event_id",
  "occurred_at",
  "mission_id",
  "project_code",
  "stage",
  "source_kind",
  "source_ref",
  "party_id",
  "unit_id",
  "automation_possibility",
  "battle_mode",
  "result",
  "intervention_count",
  "bottleneck_reason",
];
const OPTIONAL_FIELDS = ["loop_id", "next_action_note"];
const FIELD_ORDER = [...REQUIRED_FIELDS, ...OPTIONAL_FIELDS];
const SOURCE_KINDS = new Set(["mail", "manual", "dispatch", "gateway", "other"]);
const AUTOMATION_POSSIBILITIES = new Set(["low_intervention_candidate", "manual_assist_needed"]);
const BATTLE_MODES = new Set(["manual", "manual_assist", "limited_auto"]);
const RESULTS = new Set(["completed", "completed_with_follow_up", "blocked", "failed"]);
const BOTTLENECK_REASONS = new Set([
  "none",
  "missing_owner_boundary",
  "missing_acceptance_check",
  "human_confirmation_required",
  "secret_or_private_gate",
  "tool_or_validation_failure",
  "quality_review_needed",
]);
const ENUMS = {
  source_kind: SOURCE_KINDS,
  automation_possibility: AUTOMATION_POSSIBILITIES,
  battle_mode: BATTLE_MODES,
  result: RESULTS,
  bottleneck_reason: BOTTLENECK_REASONS,
};
const TEXT_LIMITS = {
  event_id: 120,
  occurred_at: 80,
  mission_id: 180,
  project_code: 120,
  stage: 220,
  source_kind: 40,
  source_ref: 220,
  party_id: 160,
  unit_id: 160,
  automation_possibility: 80,
  battle_mode: 80,
  result: 80,
  bottleneck_reason: 100,
  loop_id: 120,
  next_action_note: 360,
};
const SAFE_PATH_SEGMENT_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.-]*$/u;
const SAFE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.:@/-]*$/u;
const ISO_WITH_TIMEZONE_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/u;
const SENSITIVE_KEY_PATTERN =
  /(raw|body|html|header|token|password|passwd|secret|cookie|session|credential|authorization|attachment|payload|content)/iu;
const SECRET_TEXT_PATTERNS = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/iu,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{12,}/iu,
  /\b(token|password|passwd|secret|cookie|session|authorization)\s*[:=]\s*["']?[^"',\s)]+/iu,
  /<!doctype html|<html[\s>]|<body[\s>]|<\/body>|<\/html>/iu,
];
const RAW_SOURCE_REF_PATTERNS = [
  /^https?:\/\//iu,
  /^file:\/\//iu,
  /[?&](token|signature|expires|X-Amz-Signature)=/iu,
];

export function defaultWorkmetaRoot(repoRoot) {
  return path.join(path.resolve(repoRoot ?? process.cwd()), "_workmeta");
}

export function getBattleEventContract() {
  return {
    schema_id: BATTLE_EVENT_SCHEMA_ID,
    required_fields: [...REQUIRED_FIELDS],
    optional_fields: [...OPTIONAL_FIELDS],
    field_order: [...FIELD_ORDER],
    enums: Object.fromEntries(Object.entries(ENUMS).map(([field, allowed]) => [field, [...allowed]])),
  };
}

export function projectLogRoot(workmetaRoot, projectCode) {
  const safeProjectCode = validateProjectCode(projectCode);
  return path.join(path.resolve(workmetaRoot), safeProjectCode, "log");
}

export async function appendBattleEvent(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const workmetaRoot = path.resolve(options.workmetaRoot ?? defaultWorkmetaRoot(repoRoot));
  const rawInput = options.input ?? options.event ?? {};
  const projectCode = validateProjectCode(
    options.projectCode ?? options.project_code ?? rawInput.project_code,
  );
  const input = { ...rawInput, project_code: projectCode };

  assertNoRawPayloadKeys(input);
  if (!input.event_id) {
    input.event_id = await nextBattleEventId({ workmetaRoot, projectCode, occurredAt: input.occurred_at });
  }

  const event = normalizeBattleEvent(input, { expectedProjectCode: projectCode });
  const duplicate = await findBattleEventById({ workmetaRoot, projectCode, eventId: event.event_id });
  if (duplicate) {
    throw new Error(`duplicate_battle_event_id: ${event.event_id}`);
  }

  const stamps = dateStampsFromOccurredAt(event.occurred_at);
  const eventsPath = eventsPathFor({ workmetaRoot, projectCode, year: stamps.year, month: stamps.month });

  await appendJsonl(eventsPath, event);
  const renderResult = await renderBattleLog({
    workmetaRoot,
    projectCode,
    date: stamps.date,
    latestCount: options.latestCount,
  });

  return {
    event,
    events_path: eventsPath,
    daily_path: renderResult.daily_path,
    latest_path: renderResult.latest_path,
  };
}

export async function renderBattleLog(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const workmetaRoot = path.resolve(options.workmetaRoot ?? defaultWorkmetaRoot(repoRoot));
  const projectCode = validateProjectCode(options.projectCode ?? options.project_code);
  const latestCount = normalizePositiveInteger(options.latestCount ?? options.latest_count ?? DEFAULT_LATEST_COUNT);
  const date = normalizeDate(options.date ?? localDateFromDate(new Date()));
  const events = await readProjectBattleEvents({ workmetaRoot, projectCode });
  const dailyEvents = sortEventsOldestFirst(events.filter((event) => dateStampsFromOccurredAt(event.occurred_at).date === date));
  const latestEvents = sortEventsNewestFirst(events).slice(0, latestCount);
  const logRoot = projectLogRoot(workmetaRoot, projectCode);
  const dailyPath = path.join(logRoot, "battle_log", "daily", `${date}.md`);
  const latestPath = path.join(logRoot, "battle_log", "latest.md");

  await writeText(dailyPath, renderDailyMarkdown({ projectCode, date, events: dailyEvents }));
  await writeText(latestPath, renderLatestMarkdown({ projectCode, events: latestEvents, latestCount }));

  return {
    daily_path: dailyPath,
    latest_path: latestPath,
    daily_event_count: dailyEvents.length,
    latest_event_count: latestEvents.length,
  };
}

export async function readProjectBattleEvents(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const workmetaRoot = path.resolve(options.workmetaRoot ?? defaultWorkmetaRoot(repoRoot));
  const projectCode = validateProjectCode(options.projectCode ?? options.project_code);
  const eventsRoot = path.join(projectLogRoot(workmetaRoot, projectCode), "events");
  const files = await collectJsonlFiles(eventsRoot);
  const events = [];

  for (const filePath of files) {
    const raw = await fs.readFile(filePath, "utf8");
    const lines = raw.split(/\r?\n/u).filter(Boolean);
    for (const line of lines) {
      try {
        const parsed = JSON.parse(line);
        const event = normalizeBattleEvent(parsed, { expectedProjectCode: projectCode });
        events.push(event);
      } catch {
        // Keep the append-only stream intact; malformed historical rows are ignored by render surfaces.
      }
    }
  }

  return events;
}

export function normalizeBattleEvent(input = {}, options = {}) {
  assertNoRawPayloadKeys(input);
  const output = {};

  for (const field of REQUIRED_FIELDS) {
    if (input[field] === undefined || input[field] === null || input[field] === "") {
      throw new Error(`missing_required_battle_event_field: ${field}`);
    }
  }

  for (const field of FIELD_ORDER) {
    if (input[field] === undefined || input[field] === null || input[field] === "") {
      continue;
    }
    output[field] = normalizeField(field, input[field]);
  }

  if (options.expectedProjectCode && output.project_code !== options.expectedProjectCode) {
    throw new Error(`project_code_mismatch: ${output.project_code}`);
  }
  if (!ISO_WITH_TIMEZONE_PATTERN.test(output.occurred_at) || Number.isNaN(Date.parse(output.occurred_at))) {
    throw new Error("invalid_battle_event_occurred_at");
  }
  for (const [field, allowed] of Object.entries(ENUMS)) {
    if (!allowed.has(output[field])) {
      throw new Error(`invalid_battle_event_enum: ${field}`);
    }
  }
  if (output.bottleneck_reason === "none" && output.intervention_count > 0) {
    throw new Error("invalid_battle_event_bottleneck_reason_for_intervention");
  }
  if (isRawSourceRef(output.source_ref)) {
    throw new Error("unsafe_battle_event_source_ref");
  }

  return output;
}

export function renderDailyMarkdown({ projectCode, date, events }) {
  const title = `# Battle Log Daily - ${projectCode} - ${date}`;
  const sorted = sortEventsOldestFirst(events);
  const counts = summarizeEvents(sorted);
  return [
    title,
    "",
    `- Schema: \`${BATTLE_EVENT_SCHEMA_ID}\``,
    `- Event count: ${sorted.length}`,
    `- Results: ${formatCountMap(counts.results)}`,
    `- Interventions: ${counts.interventions}`,
    `- Bottlenecks: ${formatCountMap(counts.bottlenecks)}`,
    "",
    ...renderEventTable(sorted),
  ].join("\n");
}

export function renderLatestMarkdown({ projectCode, events, latestCount = DEFAULT_LATEST_COUNT }) {
  const sorted = sortEventsNewestFirst(events).slice(0, latestCount);
  return [
    `# Battle Log Latest - ${projectCode}`,
    "",
    `- Schema: \`${BATTLE_EVENT_SCHEMA_ID}\``,
    `- Recent limit: ${latestCount}`,
    `- Event count: ${sorted.length}`,
    "",
    ...renderEventTable(sorted),
  ].join("\n");
}

export function dateStampsFromOccurredAt(occurredAt) {
  const text = String(occurredAt);
  const match = text.match(ISO_WITH_TIMEZONE_PATTERN);
  if (!match) {
    throw new Error("invalid_battle_event_occurred_at");
  }
  return {
    year: match[1],
    month: match[2],
    day: match[3],
    date: `${match[1]}-${match[2]}-${match[3]}`,
  };
}

export function eventsPathFor({ workmetaRoot, projectCode, year, month }) {
  return path.join(projectLogRoot(workmetaRoot, projectCode), "events", year, month, "battle_events.jsonl");
}

async function nextBattleEventId({ workmetaRoot, projectCode, occurredAt }) {
  const stamps = dateStampsFromOccurredAt(occurredAt);
  const events = await readProjectBattleEvents({ workmetaRoot, projectCode });
  const prefix = `battle-${stamps.date}-`;
  const maxSequence = events.reduce((max, event) => {
    if (!String(event.event_id).startsWith(prefix)) {
      return max;
    }
    const sequence = Number.parseInt(String(event.event_id).slice(prefix.length), 10);
    return Number.isFinite(sequence) ? Math.max(max, sequence) : max;
  }, 0);
  const sequence = String(maxSequence + 1).padStart(4, "0");
  return `${prefix}${sequence}`;
}

async function findBattleEventById({ workmetaRoot, projectCode, eventId }) {
  const events = await readProjectBattleEvents({ workmetaRoot, projectCode });
  return events.find((event) => event.event_id === eventId) ?? null;
}

function normalizeField(field, value) {
  if (field === "intervention_count") {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 0) {
      throw new Error("invalid_battle_event_intervention_count");
    }
    return parsed;
  }
  if (field === "project_code") {
    return validateProjectCode(value);
  }

  const text = sanitizeBattleText(value, field, TEXT_LIMITS[field] ?? 240);
  if (["event_id", "mission_id", "party_id", "unit_id", "loop_id"].includes(field) && !SAFE_ID_PATTERN.test(text)) {
    throw new Error(`invalid_battle_event_id_field: ${field}`);
  }
  return text;
}

function validateProjectCode(value) {
  const text = sanitizeBattleText(value, "project_code", TEXT_LIMITS.project_code);
  if (!SAFE_PATH_SEGMENT_PATTERN.test(text)) {
    throw new Error("invalid_project_code");
  }
  return text;
}

function sanitizeBattleText(value, field, maxLength) {
  const text = String(value ?? "").replace(/\s+/gu, " ").trim();
  if (!text) {
    return "";
  }
  if (SECRET_TEXT_PATTERNS.some((pattern) => pattern.test(text))) {
    throw new Error(`unsafe_battle_event_text: ${field}`);
  }
  if (text.length > maxLength) {
    return `${text.slice(0, maxLength - 15)}... [truncated]`;
  }
  return text;
}

function assertNoRawPayloadKeys(value, pathParts = []) {
  if (!value || typeof value !== "object") {
    return;
  }
  for (const [key, entryValue] of Object.entries(value)) {
    const keyPath = [...pathParts, key];
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      throw new Error(`unsafe_battle_event_payload_key: ${keyPath.join(".")}`);
    }
    if (entryValue && typeof entryValue === "object") {
      assertNoRawPayloadKeys(entryValue, keyPath);
    }
  }
}

function isRawSourceRef(value) {
  return RAW_SOURCE_REF_PATTERNS.some((pattern) => pattern.test(String(value)));
}

async function collectJsonlFiles(root) {
  if (!(await pathExists(root))) {
    return [];
  }

  const entries = await fs.readdir(root, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const entryPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectJsonlFiles(entryPath)));
    } else if (entry.isFile() && entry.name.endsWith(".jsonl")) {
      files.push(entryPath);
    }
  }
  return files.sort();
}

function sortEventsOldestFirst(events) {
  return [...events].sort(compareEventsOldestFirst);
}

function sortEventsNewestFirst(events) {
  return [...events].sort((left, right) => compareEventsOldestFirst(right, left));
}

function compareEventsOldestFirst(left, right) {
  const timeDiff = Date.parse(left.occurred_at) - Date.parse(right.occurred_at);
  if (timeDiff !== 0) {
    return timeDiff;
  }
  return String(left.event_id).localeCompare(String(right.event_id));
}

function summarizeEvents(events) {
  const results = new Map();
  const bottlenecks = new Map();
  let interventions = 0;

  for (const event of events) {
    increment(results, event.result);
    increment(bottlenecks, event.bottleneck_reason);
    interventions += event.intervention_count;
  }

  return { results, bottlenecks, interventions };
}

function increment(map, key) {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function formatCountMap(map) {
  if (map.size === 0) {
    return "none";
  }
  return [...map.entries()].map(([key, count]) => `${key}=${count}`).join(", ");
}

function renderEventTable(events) {
  if (events.length === 0) {
    return ["_No battle events recorded._", ""];
  }

  const rows = [
    "| Time | Mission | Stage | Party / Unit | Mode | Result | Interventions | Source | Next action |",
    "| --- | --- | --- | --- | --- | --- | ---: | --- | --- |",
  ];
  for (const event of events) {
    const stamps = dateStampsFromOccurredAt(event.occurred_at);
    const time = String(event.occurred_at).slice(11, 16);
    rows.push([
      escapeMarkdownCell(`${stamps.date} ${time}`),
      escapeMarkdownCell(event.mission_id),
      escapeMarkdownCell(event.stage),
      escapeMarkdownCell(`${event.party_id} / ${event.unit_id}`),
      escapeMarkdownCell(event.battle_mode),
      escapeMarkdownCell(event.result),
      String(event.intervention_count),
      escapeMarkdownCell(`${event.source_kind}:${event.source_ref}`),
      escapeMarkdownCell(event.next_action_note ?? ""),
    ].join(" | ").replace(/^/, "| ").replace(/$/, " |"));
  }
  rows.push("");
  return rows;
}

function escapeMarkdownCell(value) {
  return String(value ?? "").replace(/\|/gu, "\\|").replace(/\r?\n/gu, " ").trim();
}

async function writeText(filePath, content) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${content.replace(/\s+$/u, "")}\n`, "utf8");
}

function normalizePositiveInteger(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return DEFAULT_LATEST_COUNT;
  }
  return parsed;
}

function normalizeDate(value) {
  const text = String(value ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(text) || Number.isNaN(Date.parse(`${text}T00:00:00Z`))) {
    throw new Error("invalid_battle_log_date");
  }
  return text;
}

function localDateFromDate(value) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function buildSyntheticBattleEvent(overrides = {}) {
  const occurredAt = overrides.occurred_at ?? "2026-03-19T08:40:00+09:00";
  const stamps = dateStampsFromOccurredAt(occurredAt);
  return {
    event_id: overrides.event_id ?? `battle-${stamps.date}-${crypto.randomBytes(2).toString("hex")}`,
    occurred_at: occurredAt,
    mission_id: "author_pptx_autofill_conversion_001",
    project_code: "demo_project",
    stage: "1-1 kickoff alignment",
    source_kind: "mail",
    source_ref: "synthetic-mail-2026-03-19-001",
    party_id: "guild_master_cell",
    unit_id: "guild_master",
    automation_possibility: "low_intervention_candidate",
    battle_mode: "manual_assist",
    result: "completed_with_follow_up",
    intervention_count: 1,
    bottleneck_reason: "human_confirmation_required",
    next_action_note: "status deck refresh draft review",
    ...overrides,
  };
}

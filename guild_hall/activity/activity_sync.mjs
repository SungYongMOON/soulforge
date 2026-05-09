import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  DEFAULT_MAX_EVENT_READ,
  DEFAULT_RECENT_COUNT,
  LATEST_CONTEXT_SCHEMA_VERSION,
  defaultActivityRoot,
  sanitizeActivityValue,
} from "./activity_log.mjs";
import { pathExists } from "../shared/io.mjs";

export const ACTIVITY_SYNC_RESULT_VERSION = "soulforge.activity_sync.result.v1";
export const ACTIVITY_SYNC_ID = "soulforge-activity-sync-v0";

const ACTIVITY_REF = "guild_hall/state/operations/soulforge_activity";

export function defaultPrivateStateRoot(repoRoot) {
  return path.join(repoRoot, "private-state");
}

export function defaultPrivateActivityRoot(privateStateRoot) {
  return path.join(privateStateRoot, ACTIVITY_REF);
}

export async function syncActivityToPrivateState(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const activityRoot = path.resolve(options.activityRoot ?? defaultActivityRoot(repoRoot));
  const privateStateRoot = path.resolve(options.privateStateRoot ?? defaultPrivateStateRoot(repoRoot));
  const privateActivityRoot = path.resolve(options.privateActivityRoot ?? defaultPrivateActivityRoot(privateStateRoot));
  const now = options.now instanceof Date ? options.now : new Date();
  const runCommand = options.runCommand ?? defaultRunCommand;
  const steps = [];
  const rootValidation = validatePrivateStateRoot(repoRoot, privateStateRoot);
  if (!rootValidation.ok) {
    return buildSyncResult({
      status: "blocked",
      reason: rootValidation.reason,
      repoRoot,
      activityRoot,
      privateStateRoot,
      privateActivityRoot,
      now,
      steps,
    });
  }

  if (!(await pathExists(path.join(privateStateRoot, ".git")))) {
    return buildSyncResult({
      status: "blocked",
      reason: "private_state_git_missing",
      repoRoot,
      activityRoot,
      privateStateRoot,
      privateActivityRoot,
      now,
      steps,
    });
  }

  const beforeStatus = await runGit(privateStateRoot, ["status", "--porcelain"], runCommand);
  steps.push(toStep("private_state_status_before", beforeStatus));
  if (!beforeStatus.ok) {
    return buildSyncResult({
      status: "blocked",
      reason: "private_state_status_failed",
      repoRoot,
      activityRoot,
      privateStateRoot,
      privateActivityRoot,
      now,
      steps,
    });
  }
  if (beforeStatus.stdout.trim() && options.allowDirty !== true) {
    return buildSyncResult({
      status: "blocked",
      reason: "private_state_dirty_before_sync",
      repoRoot,
      activityRoot,
      privateStateRoot,
      privateActivityRoot,
      now,
      steps,
    });
  }

  const branch = await runGit(privateStateRoot, ["branch", "--show-current"], runCommand);
  steps.push(toStep("private_state_branch", branch));
  if (!branch.ok || branch.stdout.trim() !== "main") {
    return buildSyncResult({
      status: "blocked",
      reason: "private_state_branch_not_main",
      repoRoot,
      activityRoot,
      privateStateRoot,
      privateActivityRoot,
      now,
      steps,
    });
  }

  const remote = await runGit(privateStateRoot, ["remote"], runCommand);
  steps.push(toStep("private_state_origin", remote));
  const remotes = remote.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!remote.ok || !remotes.includes("origin")) {
    return buildSyncResult({
      status: "blocked",
      reason: "private_state_origin_missing",
      repoRoot,
      activityRoot,
      privateStateRoot,
      privateActivityRoot,
      now,
      steps,
    });
  }

  if (options.skipPull !== true) {
    const pull = await runGit(privateStateRoot, ["pull", "--ff-only", "origin", "main"], runCommand);
    steps.push(toStep("private_state_pull", pull));
    if (!pull.ok) {
      return buildSyncResult({
        status: "blocked",
        reason: "private_state_pull_failed",
        repoRoot,
        activityRoot,
        privateStateRoot,
        privateActivityRoot,
        now,
        steps,
      });
    }
  }

  const merge = await mergeActivitySurfaces({ activityRoot, privateActivityRoot, now });
  steps.push({
    id: "activity_merge",
    status: "completed",
    summary: `merged ${merge.merged_event_count} activity events`,
  });

  const afterStatus = await runGit(privateStateRoot, ["status", "--porcelain"], runCommand);
  steps.push(toStep("private_state_status_after", afterStatus));
  if (!afterStatus.ok) {
    return buildSyncResult({
      status: "blocked",
      reason: "private_state_status_failed_after_merge",
      repoRoot,
      activityRoot,
      privateStateRoot,
      privateActivityRoot,
      now,
      steps,
      merge,
    });
  }

  const changed = Boolean(afterStatus.stdout.trim());
  let committed = false;
  let pushed = false;
  let commitOid = null;

  if (changed && options.skipCommit !== true) {
    const add = await runGit(privateStateRoot, ["add", ACTIVITY_REF], runCommand);
    steps.push(toStep("private_state_add_activity", add));
    if (!add.ok) {
      return buildSyncResult({
        status: "blocked",
        reason: "private_state_add_failed",
        repoRoot,
        activityRoot,
        privateStateRoot,
        privateActivityRoot,
        now,
        steps,
        merge,
      });
    }

    const commit = await runGit(privateStateRoot, ["commit", "-m", options.commitMessage ?? "chore: sync activity context"], runCommand);
    steps.push(toStep("private_state_commit", commit));
    if (!commit.ok) {
      return buildSyncResult({
        status: "blocked",
        reason: "private_state_commit_failed",
        repoRoot,
        activityRoot,
        privateStateRoot,
        privateActivityRoot,
        now,
        steps,
        merge,
      });
    }
    committed = true;

    const head = await runGit(privateStateRoot, ["rev-parse", "HEAD"], runCommand);
    steps.push(toStep("private_state_head", head));
    if (head.ok) {
      commitOid = head.stdout.trim() || null;
    }

    if (options.skipPush !== true) {
      const push = await runGit(privateStateRoot, ["push", "origin", "HEAD:main"], runCommand);
      steps.push(toStep("private_state_push", push));
      if (!push.ok) {
        return buildSyncResult({
          status: "blocked",
          reason: "private_state_push_failed",
          repoRoot,
          activityRoot,
          privateStateRoot,
          privateActivityRoot,
          now,
          steps,
          merge,
          privateStateChanged: changed,
          committed,
          commitOid,
        });
      }
      pushed = true;
    }
  }

  return buildSyncResult({
    status: "completed",
    reason: changed ? "activity_synced" : "activity_already_current",
    repoRoot,
    activityRoot,
    privateStateRoot,
    privateActivityRoot,
    now,
    steps,
    merge,
    privateStateChanged: changed,
    committed,
    pushed,
    commitOid,
  });
}

export async function mergeActivitySurfaces(options = {}) {
  const activityRoot = path.resolve(options.activityRoot);
  const privateActivityRoot = path.resolve(options.privateActivityRoot);
  const now = options.now instanceof Date ? options.now : new Date();
  const localLedger = await readActivityLedger(activityRoot);
  const privateLedger = await readActivityLedger(privateActivityRoot);
  const localEvents = localLedger.events;
  const privateEvents = privateLedger.events;
  const localIds = new Set(localEvents.map((event) => event.entry_id));
  const privateIds = new Set(privateEvents.map((event) => event.entry_id));
  const mergedEvents = mergeEventsByEntryId([...localEvents, ...privateEvents]);
  const addToLocal = mergedEvents.filter((event) => !localIds.has(event.entry_id));
  const addToPrivate = mergedEvents.filter((event) => !privateIds.has(event.entry_id));

  await fs.mkdir(activityRoot, { recursive: true });
  await fs.mkdir(privateActivityRoot, { recursive: true });
  await appendActivityEvents(activityRoot, addToLocal, now);
  await appendActivityEvents(privateActivityRoot, addToPrivate, now);
  const localLatest = await refreshLatestContextStable({ activityRoot, now });
  const privateLatest = await refreshLatestContextStable({ activityRoot: privateActivityRoot, now });

  return {
    local_event_count_before: localEvents.length,
    private_event_count_before: privateEvents.length,
    merged_event_count: mergedEvents.length,
    added_to_local: addToLocal.length,
    added_to_private: addToPrivate.length,
    malformed_rows_preserved_local: localLedger.malformed_row_count,
    malformed_rows_preserved_private: privateLedger.malformed_row_count,
    latest_context_updated_local: localLatest.updated,
    latest_context_updated_private: privateLatest.updated,
    latest_context_ref: `${ACTIVITY_REF}/latest_context.json`,
  };
}

async function readActivityLedger(activityRoot) {
  const eventsRoot = path.join(activityRoot, "events");
  const files = await collectJsonlFiles(eventsRoot);
  const events = [];
  let malformedRowCount = 0;

  for (const filePath of files) {
    let raw = "";
    try {
      raw = await fs.readFile(filePath, "utf8");
    } catch {
      continue;
    }

    for (const line of raw.split(/\r?\n/).filter(Boolean)) {
      try {
        const event = JSON.parse(line);
        if (event && typeof event === "object" && !Array.isArray(event)) {
          events.push(normalizeEvent(event));
        }
      } catch {
        malformedRowCount += 1;
      }
    }
  }

  return {
    events: events.filter((event) => event.entry_id),
    malformed_row_count: malformedRowCount,
  };
}

function normalizeEvent(event) {
  const entryId = typeof event.entry_id === "string" && event.entry_id.trim()
    ? sanitizeText(event.entry_id, "entry_id", 160)
    : `legacy_${hashStable(event).slice(0, 16)}`;

  return {
    schema_version: sanitizeText(event.schema_version, "schema_version", 120),
    entry_id: entryId,
    occurred_at: sanitizeText(event.occurred_at, "occurred_at", 80),
    date: sanitizeText(event.date, "date", 20),
    node_id: sanitizeText(event.node_id, "node_id", 160),
    node_role: sanitizeText(event.node_role, "node_role", 160),
    actor: sanitizeText(event.actor, "actor", 120),
    scope: sanitizeText(event.scope, "scope", 160),
    project_code: sanitizeText(event.project_code ?? "shared", "project_code", 160),
    action: sanitizeText(event.action, "action", 160),
    result: sanitizeText(event.result, "result", 160),
    summary: sanitizeText(event.summary, "summary", 500),
    refs: sanitizeRefs(event.refs),
    detail_owner: sanitizeText(event.detail_owner, "detail_owner", 240),
    next_action: sanitizeText(event.next_action, "next_action", 360),
    carry_forward: event.carry_forward === true,
    sensitive_content_included: false,
    sanitizer_version: "soulforge.activity.sanitizer.v1",
  };
}

function mergeEventsByEntryId(events) {
  const merged = new Map();
  for (const event of events) {
    const existing = merged.get(event.entry_id);
    if (!existing || compareEventFreshness(event, existing) >= 0) {
      merged.set(event.entry_id, event);
    }
  }
  return [...merged.values()].sort(compareEventsOldestFirst);
}

function compareEventFreshness(left, right) {
  const leftTime = eventTime(left);
  const rightTime = eventTime(right);
  if (leftTime !== rightTime) {
    return leftTime - rightTime;
  }
  return stableStringify(left).localeCompare(stableStringify(right));
}

function compareEventsOldestFirst(left, right) {
  const timeDelta = eventTime(left) - eventTime(right);
  if (timeDelta !== 0) {
    return timeDelta;
  }
  return String(left.entry_id).localeCompare(String(right.entry_id));
}

async function appendActivityEvents(activityRoot, events, now) {
  const grouped = new Map();
  for (const event of events) {
    const yearMonth = yearMonthForEvent(event, now);
    if (!grouped.has(yearMonth)) {
      grouped.set(yearMonth, []);
    }
    grouped.get(yearMonth).push(event);
  }

  for (const [yearMonth, rows] of grouped) {
    const year = yearMonth.slice(0, 4);
    const filePath = path.join(activityRoot, "events", year, `${yearMonth}.jsonl`);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    const payload = rows.map((event) => JSON.stringify(event)).join("\n");
    if (payload) {
      await fs.appendFile(filePath, `${payload}\n`, "utf8");
    }
  }
}

function yearMonthForEvent(event, fallbackDate) {
  const date = typeof event.date === "string" ? event.date : "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return date.slice(0, 7);
  }
  const parsed = new Date(event.occurred_at ?? "");
  if (!Number.isNaN(parsed.getTime())) {
    return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}`;
  }
  return `${fallbackDate.getFullYear()}-${String(fallbackDate.getMonth() + 1).padStart(2, "0")}`;
}

function eventTime(event) {
  const candidates = [event.occurred_at, event.date].filter(Boolean);
  for (const candidate of candidates) {
    const parsed = Date.parse(candidate);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return 0;
}

async function collectJsonlFiles(root) {
  if (!(await pathExists(root))) {
    return [];
  }

  const files = [];
  const stack = [root];
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

async function refreshLatestContextStable({ activityRoot, now }) {
  const latestContextPath = path.join(activityRoot, "latest_context.json");
  const existing = await readJsonIfExists(latestContextPath);
  const defaultRecentCount = normalizeRecentCount(existing?.default_recent_count ?? DEFAULT_RECENT_COUNT);
  const ledger = await readActivityLedger(activityRoot);
  const events = sortEventsNewestFirst(ledger.events).slice(0, Math.max(DEFAULT_MAX_EVENT_READ, defaultRecentCount));
  const recentEntries = events.slice(0, defaultRecentCount).map(toRecentEntry);
  const openThreads = events
    .filter((event) => event.carry_forward === true)
    .slice(0, defaultRecentCount)
    .map(toRecentEntry);
  const desired = {
    version: LATEST_CONTEXT_SCHEMA_VERSION,
    updated_on: now.toISOString(),
    default_recent_count: defaultRecentCount,
    open_threads: openThreads,
    recent_entries: recentEntries,
  };

  if (latestContextEquivalent(existing, desired)) {
    desired.updated_on = existing.updated_on;
  }

  if (stableStringify(existing) === stableStringify(desired)) {
    return { path: latestContextPath, updated: false };
  }

  await fs.mkdir(path.dirname(latestContextPath), { recursive: true });
  await fs.writeFile(latestContextPath, `${JSON.stringify(desired, null, 2)}\n`, "utf8");
  return { path: latestContextPath, updated: true };
}

async function readJsonIfExists(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch {
    return null;
  }
}

function latestContextEquivalent(left, right) {
  if (!left || typeof left !== "object" || Array.isArray(left)) {
    return false;
  }
  return stableStringify({
    version: left.version,
    default_recent_count: left.default_recent_count,
    open_threads: left.open_threads,
    recent_entries: left.recent_entries,
  }) === stableStringify({
    version: right.version,
    default_recent_count: right.default_recent_count,
    open_threads: right.open_threads,
    recent_entries: right.recent_entries,
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

function sortEventsNewestFirst(events) {
  return [...events].sort((left, right) => compareEventsOldestFirst(right, left));
}

function sanitizeText(value, key, maxLength) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  return sanitizeActivityValue(value, key, maxLength);
}

function sanitizeRefs(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .slice(0, 20)
    .map((ref) => sanitizeText(ref, "ref", 240))
    .filter(Boolean);
}

function normalizeRecentCount(value, fallback = DEFAULT_RECENT_COUNT) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }
  return Math.min(parsed, 200);
}

function validatePrivateStateRoot(repoRoot, privateStateRoot) {
  const relative = path.relative(repoRoot, privateStateRoot).split(path.sep).join("/");
  if (relative !== "private-state") {
    return {
      ok: false,
      reason: "private_state_root_must_be_nested_private_state",
    };
  }
  return { ok: true, reason: null };
}

async function runGit(cwd, args, runCommand) {
  return runCommand({ command: "git", args, cwd });
}

async function defaultRunCommand({ command, args, cwd }) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    shell: false,
  });

  return {
    ok: result.status === 0,
    status: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    command: [command, ...args].join(" "),
  };
}

function toStep(id, result) {
  return {
    id,
    status: result.ok ? "completed" : "failed",
    exit_code: result.status ?? null,
    summary: summarizeCommandResult(result),
  };
}

function summarizeCommandResult(result) {
  return result.ok ? "ok" : "failed";
}

function buildSyncResult({
  status,
  reason,
  repoRoot,
  activityRoot,
  privateStateRoot,
  privateActivityRoot,
  now,
  steps,
  merge = null,
  privateStateChanged = false,
  committed = false,
  pushed = false,
  commitOid = null,
}) {
  return {
    schema_version: ACTIVITY_SYNC_RESULT_VERSION,
    sync_id: ACTIVITY_SYNC_ID,
    status,
    reason,
    synced_at: now.toISOString(),
    roots: {
      repo: ".",
      activity: path.relative(repoRoot, activityRoot).split(path.sep).join("/") || ".",
      private_state: path.relative(repoRoot, privateStateRoot).split(path.sep).join("/") || "private-state",
      private_activity: path.relative(privateStateRoot, privateActivityRoot).split(path.sep).join("/") || ACTIVITY_REF,
    },
    merge,
    private_state: {
      changed: privateStateChanged,
      committed,
      pushed,
      commit_oid: commitOid,
    },
    steps,
    safety: {
      secret_read: false,
      raw_mail_body_read: false,
      attachment_read: false,
    },
  };
}

function hashStable(value) {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
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

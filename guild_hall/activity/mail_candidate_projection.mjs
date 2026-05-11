import { promises as fs } from "node:fs";
import path from "node:path";
import {
  appendActivityEvent,
  defaultActivityRoot,
  loadNodeIdentity,
  sanitizeActivityValue,
} from "./activity_log.mjs";
import { normalizeRepoPath, pathExists } from "../shared/io.mjs";

export const MAIL_CANDIDATE_ACTIVITY_ACTION = "mail_candidate_summary";

export function defaultMailCandidateQueueRoot(repoRoot) {
  return path.join(repoRoot, "guild_hall", "state", "gateway", "mail_candidate");
}

export async function projectMailCandidatesToActivity(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const activityRoot = path.resolve(options.activityRoot ?? defaultActivityRoot(repoRoot));
  const queueRoot = path.resolve(options.queueRoot ?? defaultMailCandidateQueueRoot(repoRoot));
  const now = options.now instanceof Date ? options.now : new Date();
  const identity = options.identity ?? (await loadNodeIdentity(repoRoot));
  const candidateFiles = await collectCandidateFiles(queueRoot);
  const latestEvents = await readLatestActivityEventsByEntryId(activityRoot);
  const results = {
    status: "completed",
    queue_root: relativeToRepo(repoRoot, queueRoot),
    candidate_count: candidateFiles.length,
    projected: 0,
    skipped_unchanged: 0,
    skipped_invalid: 0,
    projected_entry_ids: [],
  };

  for (const candidateFile of candidateFiles) {
    const candidate = await readCandidate(candidateFile);
    if (!isCandidate(candidate)) {
      results.skipped_invalid += 1;
      continue;
    }

    const projection = buildCandidateActivityInput(candidate, {
      repoRoot,
      candidateFile,
    });
    const existing = latestEvents.get(projection.entry_id);
    if (activityProjectionEquivalent(existing, projection)) {
      results.skipped_unchanged += 1;
      continue;
    }

    const activity = await appendActivityEvent({
      repoRoot,
      activityRoot,
      now,
      identity,
      input: projection,
    });
    latestEvents.set(activity.event.entry_id, activity.event);
    results.projected += 1;
    results.projected_entry_ids.push(activity.event.entry_id);
  }

  return results;
}

export function buildCandidateActivityInput(candidate, { repoRoot, candidateFile }) {
  const candidateId = safeId(candidate.candidate_id, "mail_candidate");
  const status = safeText(candidate.status, "status", 120) || "unknown";
  const pending = status === "pending_review";
  const summary = candidate.mail_summary && typeof candidate.mail_summary === "object"
    ? candidate.mail_summary
    : {};
  const sourceEvent = candidate.source_event && typeof candidate.source_event === "object"
    ? candidate.source_event
    : {};
  const subject = safeText(summary.subject, "subject", 160) || "(no subject)";
  const sender = firstSender(summary.from);
  const attachmentCount = safeCount(summary.attachment_count);
  const receivedAt = safeText(sourceEvent.received_at, "received_at", 80) || "unknown time";
  const result = pending ? "pending_review" : status;
  const candidateRef = relativeToRepo(repoRoot, candidateFile);

  return {
    entry_id: `mail_candidate:${candidateId}`,
    scope: "gateway",
    project_code: "shared",
    action: MAIL_CANDIDATE_ACTIVITY_ACTION,
    result,
    summary: `mail candidate ${result}: ${subject} / from ${sender} / attachments=${attachmentCount} / received_at=${receivedAt}`,
    refs: [candidateRef],
    detail_owner: "guild_hall/state/gateway/mail_candidate -> guild_hall/state/operations/soulforge_activity",
    next_action: pending
      ? "Review this body-safe mail candidate on the always-on node and promote it if it is real work."
      : `Candidate is no longer pending_review; current status is ${result}.`,
    carry_forward: pending,
  };
}

async function collectCandidateFiles(queueRoot) {
  const pendingRoot = path.join(queueRoot, "queue", "pending");
  if (!(await pathExists(pendingRoot))) {
    return [];
  }

  const entries = await fs.readdir(pendingRoot, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => path.join(pendingRoot, entry.name))
    .sort();
}

async function readCandidate(candidateFile) {
  try {
    return JSON.parse(await fs.readFile(candidateFile, "utf8"));
  } catch {
    return null;
  }
}

function isCandidate(value) {
  return Boolean(
    value
      && typeof value === "object"
      && !Array.isArray(value)
      && value.schema_version === "mail_candidate.queue_item.v1"
      && typeof value.candidate_id === "string"
      && value.candidate_id.trim(),
  );
}

async function readLatestActivityEventsByEntryId(activityRoot) {
  const eventsRoot = path.join(activityRoot, "events");
  const files = await collectJsonlFiles(eventsRoot);
  const latest = new Map();

  for (const file of files) {
    let raw = "";
    try {
      raw = await fs.readFile(file, "utf8");
    } catch {
      continue;
    }

    for (const line of raw.split(/\r?\n/).filter(Boolean)) {
      try {
        const event = JSON.parse(line);
        if (!event || typeof event !== "object" || Array.isArray(event) || !event.entry_id) {
          continue;
        }
        const existing = latest.get(event.entry_id);
        if (!existing || eventTime(event) >= eventTime(existing)) {
          latest.set(event.entry_id, event);
        }
      } catch {
        // Malformed historical rows stay in place; projection only needs valid activity rows.
      }
    }
  }

  return latest;
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

function activityProjectionEquivalent(existing, projection) {
  if (!existing) {
    return false;
  }
  return existing.action === projection.action
    && existing.result === projection.result
    && existing.summary === projection.summary
    && existing.next_action === projection.next_action
    && existing.carry_forward === projection.carry_forward
    && JSON.stringify(existing.refs ?? []) === JSON.stringify(projection.refs ?? []);
}

function firstSender(value) {
  if (!Array.isArray(value) || value.length === 0) {
    return "unknown sender";
  }
  const first = value[0];
  if (!first || typeof first !== "object") {
    return "unknown sender";
  }
  return safeText(first.name, "sender_name", 120)
    || safeText(first.address, "sender_address", 160)
    || "unknown sender";
}

function safeText(value, key, maxLength) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  return sanitizeActivityValue(value, key, maxLength);
}

function safeId(value, fallback) {
  const text = sanitizeActivityValue(value, "candidate_id", 160);
  return String(text ?? fallback)
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^A-Za-z0-9_.:@/-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    || fallback;
}

function safeCount(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }
  return parsed;
}

function relativeToRepo(repoRoot, filePath) {
  try {
    return normalizeRepoPath(path.relative(repoRoot, filePath));
  } catch {
    return String(filePath);
  }
}

function eventTime(event) {
  const parsed = Date.parse(event?.occurred_at ?? event?.date ?? "");
  return Number.isFinite(parsed) ? parsed : 0;
}

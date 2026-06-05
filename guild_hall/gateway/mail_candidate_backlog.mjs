import { promises as nodeFs } from "node:fs";
import path from "node:path";
import { readJson, relativeToRepo, writeJson } from "../shared/io.mjs";

export const MAIL_CANDIDATE_BACKLOG_SCHEMA_VERSION = "soulforge.gateway.mail_candidate_backlog.v1";
export const DEFAULT_BACKLOG_WARN_AGE_HOURS = 24;

export function defaultMailCandidateQueueRoot(repoRoot) {
  return path.join(repoRoot, "guild_hall", "state", "gateway", "mail_candidate");
}

export function defaultMailCandidateBacklogLatestFile(repoRoot) {
  return path.join(repoRoot, "guild_hall", "state", "gateway", "mail_candidate", "backlog_age", "latest.json");
}

export async function buildMailCandidateBacklogReport(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const queueRoot = path.resolve(options.queueRoot ?? defaultMailCandidateQueueRoot(repoRoot));
  const fs = options.fs ?? nodeFs;
  const now = options.now instanceof Date ? options.now : new Date();
  const warnAgeHours = Number(options.warnAgeHours ?? DEFAULT_BACKLOG_WARN_AGE_HOURS);
  const previousReport = normalizePreviousReport(options.previousReport);
  const collected = await collectCandidateMetadata({ repoRoot, queueRoot, fs, now });
  const pendingCandidates = collected.candidates.filter((candidate) => candidate.status === "pending_review");
  const stalePending = pendingCandidates.filter((candidate) => candidate.age_hours !== null && candidate.age_hours >= warnAgeHours);
  const oldestPendingAgeHours = pendingCandidates.reduce((oldest, candidate) => {
    if (candidate.age_hours === null) {
      return oldest;
    }
    return oldest === null ? candidate.age_hours : Math.max(oldest, candidate.age_hours);
  }, null);
  const pendingCountDelta =
    previousReport?.summary?.pending_count === undefined
      ? null
      : pendingCandidates.length - Number(previousReport.summary.pending_count ?? 0);
  const trend = trendForDelta(pendingCountDelta);
  const warningCodes = [
    stalePending.length > 0 ? "stale_pending_candidates" : null,
    pendingCountDelta !== null && pendingCountDelta > 0 ? "pending_count_increased" : null,
    collected.invalid_candidates.length > 0 ? "invalid_candidate_metadata" : null,
  ].filter(Boolean);
  const status = warningCodes.length > 0 ? "warn" : "passed";

  return {
    schema_version: MAIL_CANDIDATE_BACKLOG_SCHEMA_VERSION,
    kind: "mail_candidate_backlog_age_report",
    generated_at: now.toISOString(),
    queue_root: relativeToRepo(repoRoot, queueRoot),
    warn_age_hours: warnAgeHours,
    status,
    warning_codes: warningCodes,
    summary: {
      candidate_count: collected.candidates.length,
      pending_count: pendingCandidates.length,
      non_pending_count: collected.candidates.length - pendingCandidates.length,
      stale_pending_count: stalePending.length,
      invalid_candidate_count: collected.invalid_candidates.length,
      oldest_pending_age_hours: oldestPendingAgeHours,
      previous_pending_count: previousReport?.summary?.pending_count ?? null,
      pending_count_delta: pendingCountDelta,
      trend,
    },
    pending_candidates: pendingCandidates
      .sort(compareCandidateAgeDescending)
      .map((candidate) => ({
        candidate_id: candidate.candidate_id,
        status: candidate.status,
        candidate_ref: candidate.candidate_ref,
        received_at: candidate.received_at,
        updated_at: candidate.updated_at,
        created_at: candidate.created_at,
        age_hours: candidate.age_hours,
        stale: candidate.age_hours !== null && candidate.age_hours >= warnAgeHours,
      })),
    invalid_candidates: collected.invalid_candidates,
    claim_boundary: {
      metadata_only: true,
      body_safe: true,
      raw_mail_body_copied: false,
      attachment_payload_copied: false,
      secret_value_copied: false,
      promotion_or_owner_approval_changed: false,
    },
  };
}

export async function refreshMailCandidateBacklogReport(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const outputFile = options.outputFile ? path.resolve(options.outputFile) : null;
  const previousReport =
    options.previousReport ??
    (options.previousFile ? await readPreviousReport(path.resolve(options.previousFile)) : null);
  const report = await buildMailCandidateBacklogReport({
    ...options,
    repoRoot,
    previousReport,
  });

  if (outputFile) {
    await writeJson(outputFile, report);
  }

  return {
    ...report,
    output_ref: outputFile ? relativeToRepo(repoRoot, outputFile) : null,
  };
}

async function collectCandidateMetadata({ repoRoot, queueRoot, fs, now }) {
  const pendingRoot = path.join(queueRoot, "queue", "pending");
  const candidates = [];
  const invalidCandidates = [];

  if (!(await pathExistsWithFs(fs, pendingRoot))) {
    return { candidates, invalid_candidates: invalidCandidates };
  }

  const entries = await fs.readdir(pendingRoot, { withFileTypes: true });
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) {
      continue;
    }

    const candidateFile = path.join(pendingRoot, entry.name);
    const candidateRef = relativeToRepo(repoRoot, candidateFile);
    let candidate;
    try {
      candidate = await readJson(candidateFile);
    } catch {
      invalidCandidates.push({
        candidate_ref: candidateRef,
        reason: "invalid_json",
      });
      continue;
    }

    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate) || !candidate.candidate_id) {
      invalidCandidates.push({
        candidate_ref: candidateRef,
        reason: "invalid_candidate_metadata",
      });
      continue;
    }

    const sourceEvent = safeObject(candidate.source_event);
    const businessReview = safeObject(candidate.business_review);
    const receivedAt = safeDateText(sourceEvent.received_at);
    const updatedAt = safeDateText(candidate.updated_at) ?? safeDateText(businessReview.updated_at);
    const createdAt = safeDateText(candidate.created_at);
    const ageBasis = updatedAt ?? receivedAt ?? createdAt;
    candidates.push({
      candidate_id: safeId(candidate.candidate_id),
      status: safeStatus(candidate.status),
      candidate_ref: candidateRef,
      received_at: receivedAt,
      updated_at: updatedAt,
      created_at: createdAt,
      age_hours: ageBasis ? hoursBetween(ageBasis, now) : null,
    });
  }

  return { candidates, invalid_candidates: invalidCandidates };
}

async function pathExistsWithFs(fs, filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readPreviousReport(previousFile) {
  try {
    return await readJson(previousFile);
  } catch {
    return null;
  }
}

function normalizePreviousReport(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value;
}

function safeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function safeId(value) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/gu, "_")
    .replace(/[^A-Za-z0-9_.:@/-]/gu, "_")
    .replace(/_+/gu, "_")
    .replace(/^_+|_+$/gu, "")
    || "unknown_candidate";
}

function safeStatus(value) {
  return String(value ?? "unknown").trim().slice(0, 80) || "unknown";
}

function safeDateText(value) {
  const text = String(value ?? "").trim();
  if (!text) {
    return null;
  }
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? text : null;
}

function hoursBetween(isoText, now) {
  const parsed = Date.parse(isoText);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return Math.max(0, Math.round(((now.getTime() - parsed) / (60 * 60 * 1000)) * 10) / 10);
}

function trendForDelta(delta) {
  if (delta === null) {
    return "unknown";
  }
  if (delta > 0) {
    return "increased";
  }
  if (delta < 0) {
    return "decreased";
  }
  return "unchanged";
}

function compareCandidateAgeDescending(left, right) {
  const leftAge = left.age_hours ?? -1;
  const rightAge = right.age_hours ?? -1;
  if (leftAge !== rightAge) {
    return rightAge - leftAge;
  }
  return left.candidate_id.localeCompare(right.candidate_id);
}

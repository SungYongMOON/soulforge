import { promises as fs } from "node:fs";
import path from "node:path";
import { pathExists, readJson, relativeToRepo, writeJson } from "../shared/io.mjs";
import { sanitizeId } from "./message_rendering.mjs";
import {
  buildMailProjectRoutingSuggestion,
  loadMailProjectRouterBinding,
} from "./mail_project_router.mjs";

export const MAIL_CANDIDATE_SCHEMA_VERSION = "mail_candidate.queue_item.v1";
export const MAIL_CANDIDATE_PROMOTED_STATUS = "promoted_to_intake_request";

export async function listMailCandidates({ repoRoot, queueRoot, status = "pending_review" }) {
  const pendingRoot = path.join(queueRoot, "queue", "pending");
  if (!(await pathExists(pendingRoot))) {
    return [];
  }

  const entries = await fs.readdir(pendingRoot, { withFileTypes: true });
  const candidates = [];

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) {
      continue;
    }
    const candidateFile = path.join(pendingRoot, entry.name);
    const candidate = await readJson(candidateFile);
    if (status && candidate.status !== status) {
      continue;
    }
    candidates.push(summarizeMailCandidate(repoRoot, candidateFile, candidate));
  }

  return candidates.sort((left, right) => {
    const leftCreated = String(left.created_at ?? "");
    const rightCreated = String(right.created_at ?? "");
    if (leftCreated !== rightCreated) {
      return leftCreated.localeCompare(rightCreated);
    }
    return left.candidate_id.localeCompare(right.candidate_id);
  });
}

export async function promoteMailCandidate({
  repoRoot,
  candidateFile,
  outputFile = null,
  updateCandidate = true,
  force = false,
  allowOutputOutsideState = false,
  now = new Date(),
}) {
  const resolvedCandidateFile = path.resolve(candidateFile);
  const candidate = await readJson(resolvedCandidateFile);
  validateMailCandidate(candidate, { force });
  const resolvedOutputFile =
    outputFile !== null
      ? path.resolve(outputFile)
      : defaultMailIntakeRequestFile(repoRoot, candidate);
  if (!allowOutputOutsideState) {
    assertMailCandidateRequestOutput(repoRoot, resolvedOutputFile);
  }

  const eventRecord = await readCandidateEventRecord(repoRoot, candidate);
  const request = buildMailIntakeRequest(candidate, eventRecord);

  await writeJson(resolvedOutputFile, request);

  let candidateRef = null;
  if (updateCandidate) {
    const promoted = markCandidatePromoted(candidate, {
      requestFile: resolvedOutputFile,
      repoRoot,
      now,
    });
    await writeJson(resolvedCandidateFile, promoted);
    candidateRef = relativeToRepo(repoRoot, resolvedCandidateFile);
  }

  return {
    request_id: `mail_candidate_promote_${candidate.candidate_id}`,
    status: "promoted",
    candidate_id: candidate.candidate_id,
    candidate_ref: candidateRef ?? relativeToRepo(repoRoot, resolvedCandidateFile),
    mail_intake_request_ref: relativeToRepo(repoRoot, resolvedOutputFile),
    source_event_id: request.event_id,
    intake_command: `npm run guild-hall:gateway:intake -- --payload-file ${relativeToRepo(repoRoot, resolvedOutputFile)}`,
  };
}

export async function triageMailCandidate({
  repoRoot,
  candidateFile,
  bindingFile = null,
  routerBinding = null,
  bindingRef = null,
  now = new Date(),
  force = false,
  privateDeep = false,
}) {
  const resolvedCandidateFile = path.resolve(candidateFile);
  const candidate = await readJson(resolvedCandidateFile);
  validateMailCandidate(candidate, { force });

  const router = routerBinding
    ? { binding: routerBinding, binding_ref: bindingRef ?? null }
    : await loadMailProjectRouterBinding({ repoRoot, bindingFile });
  const suggestion = buildMailProjectRoutingSuggestion(candidate, {
    binding: router.binding,
    bindingRef: router.binding_ref,
    now,
    privateDeep,
    eventRecord: privateDeep ? await readCandidateEventRecord(repoRoot, candidate) : null,
  });
  const updatedCandidate = markCandidateTriaged(candidate, {
    suggestion,
    now,
  });

  await writeJson(resolvedCandidateFile, updatedCandidate);

  return {
    request_id: `mail_candidate_triage_${candidate.candidate_id}`,
    status: "triaged",
    candidate_id: candidate.candidate_id,
    candidate_ref: relativeToRepo(repoRoot, resolvedCandidateFile),
    routing_suggestion: suggestion,
  };
}

export async function triagePendingMailCandidates({
  repoRoot,
  queueRoot,
  bindingFile = null,
  now = new Date(),
  privateDeep = false,
}) {
  const router = await loadMailProjectRouterBinding({ repoRoot, bindingFile });
  const candidateFiles = await listPendingMailCandidateFiles(queueRoot);
  const results = [];
  let triaged = 0;
  let skippedInvalid = 0;

  for (const candidateFile of candidateFiles) {
    try {
      const result = await triageMailCandidate({
        repoRoot,
        candidateFile,
        routerBinding: router.binding,
        bindingRef: router.binding_ref,
        now,
        privateDeep,
      });
      results.push(result);
      triaged += 1;
    } catch (error) {
      results.push({
        status: "skipped_invalid",
        candidate_ref: relativeToRepo(repoRoot, candidateFile),
        reason: error instanceof Error ? error.message : String(error),
      });
      skippedInvalid += 1;
    }
  }

  return {
    request_id: "mail_candidate_triage_pending",
    status: "completed",
    queue_root: relativeToRepo(repoRoot, queueRoot),
    binding_ref: router.binding_ref,
    candidate_count: candidateFiles.length,
    triaged,
    skipped_invalid: skippedInvalid,
    results,
  };
}

export function buildMailIntakeRequest(candidate, eventRecord = {}) {
  const sourceEvent = candidate.source_event ?? {};
  const mailSummary = candidate.mail_summary ?? {};
  const eventId = requireString(sourceEvent.event_id, "source_event.event_id");
  const source = requireString(sourceEvent.source, "source_event.source");
  const workspace = String(sourceEvent.workspace || workspaceForSource(source)).trim() || workspaceForSource(source);
  const providerMessageId = requireString(
    eventRecord.provider_message_id ?? sourceEvent.provider_message_id ?? eventId,
    "provider_message_id",
  );
  const receivedAt = requireString(sourceEvent.received_at ?? eventRecord.received_at, "received_at");
  const eventFile = requireString(sourceEvent.event_file, "source_event.event_file");
  const subject = String(mailSummary.subject ?? eventRecord.subject ?? "").trim();

  return {
    action: "mail_intake_request",
    event_id: eventId,
    source,
    mailbox_id: mailboxIdForWorkspace(workspace),
    provider_message_id: providerMessageId,
    received_at: receivedAt,
    event_ref: `${eventFile}#event_id=${eventId}`,
    raw_ref: rawRefForEvent({ eventFile, source, providerMessageId }),
    attachment_refs: [],
    thread_ref: eventRecord.thread_id ?? null,
    subject,
    from: normalizeAddressEntries(mailSummary.from ?? eventRecord.from),
    to: normalizeAddressEntries(eventRecord.to),
    cc: normalizeAddressEntries(eventRecord.cc),
    body_excerpt: null,
    monsters: [
      {
        monster_family: "unknown_monster",
        work_pattern: "mail_candidate_review",
        objective: objectiveForSubject(subject),
        objective_ko: objectiveKoForSubject(subject),
        dedupe_key: `mail:${source}:${eventId}`,
        mail_role: "new_request",
      },
    ],
  };
}

export function defaultMailIntakeRequestFile(repoRoot, candidate) {
  return path.join(
    mailCandidateRequestRoot(repoRoot),
    `${sanitizeId(candidate.candidate_id)}.mail_intake_request.json`,
  );
}

export function mailCandidateRequestRoot(repoRoot) {
  return path.join(repoRoot, "guild_hall", "state", "gateway", "mail_candidate", "requests");
}

export function assertMailCandidateRequestOutput(repoRoot, outputFile) {
  const requestRoot = mailCandidateRequestRoot(repoRoot);
  if (!isPathInside(requestRoot, outputFile)) {
    throw new Error(
      `output file must stay under ${relativeToRepo(repoRoot, requestRoot)} unless allowOutputOutsideState is set`,
    );
  }
}

export function summarizeMailCandidate(repoRoot, candidateFile, candidate) {
  const sourceEvent = candidate.source_event ?? {};
  const mailSummary = candidate.mail_summary ?? {};
  return {
    candidate_id: candidate.candidate_id,
    status: candidate.status,
    created_at: candidate.created_at ?? null,
    source: sourceEvent.source ?? null,
    event_id: sourceEvent.event_id ?? null,
    received_at: sourceEvent.received_at ?? null,
    subject: mailSummary.subject ?? null,
    from: normalizeAddressEntries(mailSummary.from),
    attachment_count: Number(mailSummary.attachment_count ?? 0),
    candidate_ref: relativeToRepo(repoRoot, candidateFile),
  };
}

export function validateMailCandidate(candidate, { force = false } = {}) {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    throw new Error("candidate must be an object");
  }
  if (candidate.schema_version !== MAIL_CANDIDATE_SCHEMA_VERSION) {
    throw new Error(`unsupported candidate schema_version: ${candidate.schema_version}`);
  }
  if (!candidate.candidate_id) {
    throw new Error("missing required candidate_id");
  }
  if (!force && candidate.status !== "pending_review") {
    throw new Error(`candidate is not pending_review: ${candidate.status}`);
  }
  const sourceEvent = candidate.source_event ?? {};
  for (const field of ["event_id", "source", "event_file", "received_at"]) {
    if (!sourceEvent[field]) {
      throw new Error(`missing required source_event.${field}`);
    }
  }
}

async function listPendingMailCandidateFiles(queueRoot) {
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

export async function readCandidateEventRecord(repoRoot, candidate) {
  const sourceEvent = candidate.source_event ?? {};
  const eventFile = resolveRepoPath(repoRoot, requireString(sourceEvent.event_file, "source_event.event_file"));
  const eventId = requireString(sourceEvent.event_id, "source_event.event_id");
  assertCandidateEventFile(repoRoot, eventFile);
  if (!(await pathExists(eventFile))) {
    throw new Error(`source event file not found: ${sourceEvent.event_file}`);
  }

  const raw = await fs.readFile(eventFile, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) {
      continue;
    }
    const row = JSON.parse(line);
    if (row.event_id === eventId) {
      return row;
    }
  }
  throw new Error(`source event not found: ${eventId}`);
}

export function assertCandidateEventFile(repoRoot, eventFile) {
  const mailboxRoot = path.join(repoRoot, "guild_hall", "state", "gateway", "mailbox");
  if (!isPathInside(mailboxRoot, eventFile)) {
    throw new Error(`source event file must stay under ${relativeToRepo(repoRoot, mailboxRoot)}`);
  }
}

export function markCandidatePromoted(candidate, { requestFile, repoRoot, now }) {
  const at = now.toISOString();
  const businessReview = { ...(candidate.business_review ?? {}) };
  businessReview.status = "completed";
  businessReview.intake_request_status = "created";
  businessReview.intake_request_ref = relativeToRepo(repoRoot, requestFile);
  businessReview.promoted_at = at;

  return {
    ...candidate,
    status: MAIL_CANDIDATE_PROMOTED_STATUS,
    updated_at: at,
    business_review: businessReview,
  };
}

export function markCandidateTriaged(candidate, { suggestion, now }) {
  const businessReview = { ...(candidate.business_review ?? {}) };
  businessReview.status = "triaged";
  businessReview.next_action = suggestion.next_action;
  businessReview.project_routing_suggestion = suggestion;

  return {
    ...candidate,
    updated_at: now.toISOString(),
    business_review: businessReview,
  };
}

function rawRefForEvent({ eventFile, source, providerMessageId }) {
  const rawFile = eventFile.replace(`/mail/events/${source}/`, `/mail/raw/${source}/`);
  return `${rawFile}#provider_message_id=${providerMessageId}`;
}

function workspaceForSource(source) {
  if (source === "hiworks" || source === "o365") {
    return "company";
  }
  return "personal";
}

function mailboxIdForWorkspace(workspace) {
  if (workspace === "company") {
    return "company_mailbox";
  }
  if (workspace === "personal") {
    return "personal_mailbox";
  }
  return `${sanitizeId(workspace)}_mailbox`;
}

function objectiveForSubject(subject) {
  if (!subject) {
    return "Review and process the mail candidate.";
  }
  return `Review and process the mail candidate: ${subject}`;
}

function objectiveKoForSubject(subject) {
  if (!subject) {
    return "메일 후보를 검토하고 업무화 여부를 결정합니다.";
  }
  return `메일 후보를 검토하고 업무화 여부를 결정합니다: ${subject}`;
}

function normalizeAddressEntries(value) {
  const entries = Array.isArray(value) ? value : value ? [value] : [];
  return entries
    .map((entry) => {
      if (!entry) {
        return null;
      }
      if (typeof entry === "string") {
        return { name: null, address: entry };
      }
      return {
        name: entry.name ?? null,
        address: entry.address ?? entry.email ?? null,
      };
    })
    .filter((entry) => entry && entry.address);
}

function resolveRepoPath(repoRoot, value) {
  const raw = String(value || "").trim();
  if (!raw) {
    throw new Error("missing path value");
  }
  if (path.isAbsolute(raw)) {
    return raw;
  }
  return path.resolve(repoRoot, raw);
}

function requireString(value, field) {
  const raw = String(value ?? "").trim();
  if (!raw) {
    throw new Error(`missing required field: ${field}`);
  }
  return raw;
}

function isPathInside(rootPath, targetPath) {
  const relative = path.relative(path.resolve(rootPath), path.resolve(targetPath));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

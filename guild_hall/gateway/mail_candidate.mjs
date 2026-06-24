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
  const candidateMetadata = buildSafeCandidateAutomationMetadata(candidate);
  const projectHints = uniqueValues([
    isProjectRoute(candidateMetadata.route_candidate) ? candidateMetadata.route_candidate : null,
    candidateMetadata.route_hint_candidates,
  ]);
  const stageHints = uniqueValues([candidateMetadata.route_stage]);

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
    candidate_metadata: candidateMetadata,
    body_excerpt: null,
    monsters: [
      {
        monster_family: "unknown_monster",
        work_pattern: "mail_candidate_review",
        objective: objectiveForSubject(subject),
        objective_ko: objectiveKoForSubject(subject),
        dedupe_key: `mail:${source}:${eventId}`,
        mail_role: "new_request",
        project_hints: projectHints,
        stage_hints: stageHints,
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
  const candidateMetadata = buildSafeCandidateAutomationMetadata(candidate);
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
    attachment_types: candidateMetadata.attachment_types,
    classification_label: candidateMetadata.classification_label,
    classification_reasons: candidateMetadata.classification_reasons,
    blocked_attachment_count: candidateMetadata.blocked_attachment_count,
    review_status: candidateMetadata.review_status,
    review_reason: candidateMetadata.review_reason,
    route_candidate: candidateMetadata.route_candidate,
    route_confidence: candidateMetadata.route_confidence,
    route_suggestion_confidence: candidateMetadata.route_suggestion_confidence,
    route_reason: candidateMetadata.route_reason,
    route_reason_codes: candidateMetadata.route_reason_codes,
    route_source: candidateMetadata.route_source,
    route_status: candidateMetadata.route_status,
    route_id: candidateMetadata.route_id,
    route_stage: candidateMetadata.route_stage,
    routing_rule_ref: candidateMetadata.routing_rule_ref,
    route_matched_on: candidateMetadata.route_matched_on,
    route_hint_candidates: candidateMetadata.route_hint_candidates,
    owner_assignment_override: candidateMetadata.owner_assignment_override,
    suggested_assignee: candidateMetadata.suggested_assignee,
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

// ── 메일 본문 발췌(미리보기) resolver ────────────────────────────────────────────
//   본문은 런타임 이벤트 싱크(guild_hall/state/gateway/mailbox/**, gitignored)에만 있다.
//   _workmeta 원장(메일_이력.csv)·후보 큐 JSON 에는 본문이 들어가지 않는다(test_mail_candidate_queue 불변식).
//   여기서 뽑은 발췌는 core_mail.body_preview(런타임 DB)에만 착지하며, 원문 전체·첨부는 저장하지 않는다.
const HTML_ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

function htmlToText(html) {
  const raw = String(html ?? "");
  if (!raw) return "";
  return raw
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ") // 스크립트/스타일 블록 통째 제거
    .replace(/<[^>]+>/g, " ") // 남은 태그 제거
    .replace(/&#(\d+);/g, (_, code) => { try { return String.fromCodePoint(Number(code)); } catch { return " "; } })
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => { try { return String.fromCodePoint(parseInt(code, 16)); } catch { return " "; } })
    .replace(/&([a-z]+);/gi, (match, name) => HTML_ENTITIES[name.toLowerCase()] ?? match);
}

// 이벤트 레코드 → 발췌(미리보기). text/plain 우선, 없으면 html→text. 공백 정리 후 maxChars 컷.
export function mailBodyExcerptFromRecord(record, { maxChars = 2000 } = {}) {
  const fromText = String(record?.body_text ?? "").trim();
  const text = fromText || htmlToText(record?.body_html);
  const cleaned = String(text ?? "").replace(/\s+/g, " ").trim();
  if (!cleaned) return null;
  return cleaned.slice(0, Math.max(1, maxChars)) || null;
}

// 한 이벤트 싱크 JSONL → Map(event_id → 발췌). 싱크(mailbox) 경로 밖 읽기는 거부한다.
export async function loadMailBodyExcerptIndex({ repoRoot, eventFile, maxChars = 2000 }) {
  const index = new Map();
  const resolved = resolveRepoPath(repoRoot, eventFile);
  assertCandidateEventFile(repoRoot, resolved);
  if (!(await pathExists(resolved))) {
    return index;
  }
  const raw = await fs.readFile(resolved, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) {
      continue;
    }
    let row;
    try {
      row = JSON.parse(line);
    } catch {
      continue;
    }
    const eventId = String(row?.event_id ?? "").trim();
    if (!eventId || index.has(eventId)) {
      continue;
    }
    const excerpt = mailBodyExcerptFromRecord(row, { maxChars });
    if (excerpt) {
      index.set(eventId, excerpt);
    }
  }
  return index;
}

export function assertMailCandidateQueueFile(repoRoot, candidateFile) {
  const queueRoot = path.join(repoRoot, "guild_hall", "state", "gateway", "mail_candidate");
  if (!isPathInside(queueRoot, candidateFile)) {
    throw new Error(`candidate file must stay under ${relativeToRepo(repoRoot, queueRoot)}`);
  }
}

// 후보 큐 포인터(파일링패킷참조) → 본문 발췌. 후보 JSON 의 source_event(event_file·event_id)로 싱크를 찾는다.
//   cache: Map(event_file 절대경로 → index Map) — 같은 월 JSONL 재읽기 방지(배치 스캔용).
//   본문 미수집(후보/싱크 부재 등)은 정상 경로라 throw 하지 않고 null 을 돌려준다.
export async function readMailBodyPreview({ repoRoot, candidateRef, cache = null, maxChars = 2000 }) {
  const ref = String(candidateRef ?? "").trim();
  if (!ref) {
    return null;
  }
  try {
    const candidateFile = resolveRepoPath(repoRoot, ref);
    assertMailCandidateQueueFile(repoRoot, candidateFile);
    if (!(await pathExists(candidateFile))) {
      return null;
    }
    const candidate = await readJson(candidateFile);
    const sourceEvent = candidate?.source_event ?? {};
    const eventFile = String(sourceEvent.event_file ?? "").trim();
    const eventId = String(sourceEvent.event_id ?? "").trim();
    if (!eventFile || !eventId) {
      return null;
    }
    const eventKey = resolveRepoPath(repoRoot, eventFile);
    let index = cache?.get(eventKey);
    if (!index) {
      index = await loadMailBodyExcerptIndex({ repoRoot, eventFile, maxChars });
      cache?.set(eventKey, index);
    }
    return index.get(eventId) ?? null;
  } catch {
    return null;
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

export function buildSafeCandidateAutomationMetadata(candidate) {
  const mailSummary = candidate?.mail_summary ?? {};
  const businessReview = candidate?.business_review ?? {};
  const classification = summarizeCandidateClassification(mailSummary.classification);
  const routeMetadata = summarizeRouteMetadata(candidate);

  return {
    schema_version: "mail_candidate.safe_automation_metadata.v1",
    review_status: businessReview.status ?? null,
    review_reason: firstNonEmpty(businessReview.reason, businessReview.review_reason, candidate?.review_reason),
    classification_bucket: classification.bucket,
    classification_label: classification.label,
    classification_reasons: classification.reasons,
    attachment_count: Number(mailSummary.attachment_count ?? 0),
    attachment_types: sanitizeAttachmentTypeLabels(mailSummary.attachment_types),
    blocked_attachment_count: classification.blocked_attachment_count,
    route_candidate: routeMetadata.route_candidate,
    route_confidence: routeMetadata.route_confidence,
    route_suggestion_confidence: routeMetadata.route_suggestion_confidence,
    route_reason: routeMetadata.route_reason,
    route_reason_codes: routeMetadata.route_reason_codes,
    route_source: routeMetadata.route_source,
    route_status: routeMetadata.route_status,
    route_id: routeMetadata.route_id,
    route_stage: routeMetadata.route_stage,
    routing_rule_ref: routeMetadata.routing_rule_ref,
    route_matched_on: routeMetadata.route_matched_on,
    route_hint_candidates: collectRouteHintCandidates(candidate, routeMetadata),
    owner_assignment_override: sanitizeOwnerAssignmentMetadata(
      firstPresent(
        businessReview.owner_assignment_override,
        businessReview.assignment_override,
        businessReview.owner_override,
        candidate?.owner_assignment_override,
      ),
    ),
    suggested_assignee: sanitizeOwnerAssignmentMetadata(
      firstPresent(
        businessReview.suggested_assignee,
        businessReview.assignee_suggestion,
        candidate?.suggested_assignee,
      ),
    ),
    boundary: {
      raw_payload_copied: false,
      body_copied: false,
      attachment_payload_copied: false,
      attachment_names_copied: false,
      recipient_payload_copied_beyond_existing_metadata: false,
    },
  };
}

function summarizeCandidateClassification(classification) {
  if (typeof classification === "string") {
    const label = stringOrNull(classification);
    return {
      bucket: label,
      label,
      reasons: [],
      blocked_attachment_count: 0,
    };
  }

  if (!classification || typeof classification !== "object" || Array.isArray(classification)) {
    return {
      bucket: null,
      label: null,
      reasons: [],
      blocked_attachment_count: 0,
    };
  }

  const bucket = stringOrNull(classification.bucket);
  return {
    bucket,
    label: stringOrNull(classification.label ?? classification.classification_label) ?? bucket,
    reasons: normalizeStringArray(classification.reasons ?? classification.reason_codes),
    blocked_attachment_count: safeNumber(classification.blocked_attachment_count),
  };
}

function summarizeRouteMetadata(candidate) {
  const businessReview = candidate?.business_review ?? {};
  const suggestion = firstPresent(
    businessReview.project_routing_suggestion,
    businessReview.route_suggestion,
    candidate?.project_routing_suggestion,
  );
  if (!suggestion || typeof suggestion !== "object" || Array.isArray(suggestion)) {
    return emptyRouteMetadata();
  }

  const routeCandidate = stringOrNull(
    suggestion.project_code ??
      suggestion.route_candidate ??
      suggestion.suggested_project_code,
  );
  const routeReasonCodes = normalizeStringArray(suggestion.reason_codes ?? suggestion.route_reason_codes);
  const routeReason = firstNonEmpty(
    suggestion.reason,
    suggestion.route_reason,
    routeReasonCodes.length > 0 ? routeReasonCodes.join(",") : null,
  );

  return {
    route_candidate: routeCandidate,
    route_confidence: routeCandidate
      ? normalizePriorityRouteConfidence(suggestion.route_confidence ?? suggestion.confidence, routeCandidate)
      : null,
    route_suggestion_confidence: scalarOrNull(suggestion.confidence ?? suggestion.route_confidence),
    route_reason: routeReason,
    route_reason_codes: routeReasonCodes,
    route_source: stringOrNull(suggestion.route_source ?? suggestion.source),
    route_status: stringOrNull(suggestion.status),
    route_id: stringOrNull(suggestion.route_id),
    route_stage: stringOrNull(suggestion.stage ?? suggestion.project_stage),
    routing_rule_ref: stringOrNull(suggestion.routing_rule_ref),
    route_matched_on: normalizeStringArray(suggestion.matched_on),
  };
}

function emptyRouteMetadata() {
  return {
    route_candidate: null,
    route_confidence: null,
    route_suggestion_confidence: null,
    route_reason: null,
    route_reason_codes: [],
    route_source: null,
    route_status: null,
    route_id: null,
    route_stage: null,
    routing_rule_ref: null,
    route_matched_on: [],
  };
}

function collectRouteHintCandidates(candidate, routeMetadata) {
  const businessReview = candidate?.business_review ?? {};
  const mailSummary = candidate?.mail_summary ?? {};
  return uniqueValues([
    normalizeStringArray(candidate?.route_hint_candidates),
    normalizeStringArray(mailSummary.route_hint_candidates),
    normalizeStringArray(businessReview.route_hint_candidates),
    normalizeStringArray(businessReview.project_hints),
    normalizeStringArray(businessReview.project_routing_suggestion?.route_hint_candidates),
    normalizeStringArray(businessReview.project_routing_suggestion?.project_hints),
    isProjectRoute(routeMetadata.route_candidate) ? routeMetadata.route_candidate : null,
  ]);
}

function sanitizeOwnerAssignmentMetadata(value) {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return scalarOrNull(value);
  }
  if (Array.isArray(value)) {
    const entries = value.map((entry) => sanitizeOwnerAssignmentMetadata(entry)).filter((entry) => entry !== null);
    return entries.length > 0 ? entries : null;
  }
  if (typeof value !== "object") {
    return null;
  }

  const allowed = new Set([
    "assignee",
    "assignee_id",
    "assignee_label",
    "assignee_role",
    "confidence",
    "owner",
    "owner_id",
    "owner_label",
    "owner_role",
    "project_code",
    "reason",
    "reason_code",
    "reason_codes",
    "role_id",
    "source",
    "stage",
    "status",
    "suggested_assignee",
    "suggested_assignee_id",
    "suggested_assignee_label",
    "team",
    "team_id",
    "unit_id",
    "updated_at",
  ]);
  const output = {};

  for (const [key, entry] of Object.entries(value)) {
    if (!allowed.has(key)) {
      continue;
    }
    if (key === "reason_codes") {
      output[key] = normalizeStringArray(entry);
      continue;
    }
    const sanitized = sanitizeOwnerAssignmentMetadata(entry);
    if (sanitized !== null) {
      output[key] = sanitized;
    }
  }

  return Object.keys(output).length > 0 ? output : null;
}

function sanitizeAttachmentTypeLabels(values) {
  const labels = [];
  for (const value of normalizeArray(values)) {
    const raw = String(value ?? "").trim().toLowerCase();
    if (!raw) {
      continue;
    }
    if (SAFE_ATTACHMENT_TYPE_LABELS.has(raw)) {
      labels.push(raw);
      continue;
    }
    if (raw.startsWith("image/")) {
      labels.push("mime_image");
      continue;
    }
    if (raw.startsWith("text/")) {
      labels.push("mime_text");
      continue;
    }
    if (raw.startsWith("application/")) {
      labels.push("mime_application");
      continue;
    }
    labels.push("attachment_metadata");
  }
  return uniqueValues(labels).sort();
}

const SAFE_ATTACHMENT_TYPE_LABELS = new Set([
  "binary_attachment",
  "body_link",
  "inline_attachment",
  "calendar_invite",
  "message_part",
  "attachment_metadata",
  "mime_image",
  "mime_text",
  "mime_application",
]);

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

function firstNonEmpty(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

function normalizeArray(value) {
  if (!value) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

function normalizeStringArray(value) {
  return uniqueValues(normalizeArray(value).map((entry) => stringOrNull(entry)).filter(Boolean));
}

function uniqueValues(values) {
  return [...new Set(normalizeArray(values).flat().filter(Boolean))];
}

function safeNumber(value) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function firstPresent(...values) {
  for (const value of values) {
    if (value !== null && value !== undefined) {
      return value;
    }
  }
  return null;
}

function scalarOrNull(value) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "boolean") {
    return value;
  }
  return stringOrNull(value);
}

function stringOrNull(value) {
  const text = String(value ?? "").trim();
  return text ? text : null;
}

function normalizePriorityRouteConfidence(value, routeCandidate = null) {
  if (String(routeCandidate ?? "").startsWith("none/")) {
    return "none";
  }
  if (typeof value === "number") {
    return value >= 0.9 ? "exact" : "review";
  }

  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "none") {
    return "none";
  }
  if (["exact", "high", "confirmed", "owner_confirmed"].includes(normalized)) {
    return "exact";
  }
  if (["review", "hint", "suggested", "defaulted", "manual_review", "medium", "low"].includes(normalized)) {
    return "review";
  }
  return routeCandidate ? "review" : "none";
}

function isProjectRoute(value) {
  return /^P\d{2}-\d{3}$/u.test(String(value ?? ""));
}

function isPathInside(rootPath, targetPath) {
  const relative = path.relative(path.resolve(rootPath), path.resolve(targetPath));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

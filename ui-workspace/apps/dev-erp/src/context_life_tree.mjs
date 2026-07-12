// ENGINE-12: source-local histories를 읽어 과제 -> 서울 업무일 -> exact context -> event leaf로
// 투영한다. 이 모듈은 원장/DB/project_context를 쓰지 않으며 raw payload를 읽지 않는다.
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { parseCsv } from "./autosync.mjs";
import { readFileActivityLifeTreeProjection } from "./file_activity_life_tree_projection.mjs";

export const CONTEXT_LIFE_TREE_SCHEMA = "dev_erp.context_life_tree.v1";
export const CONTEXT_LIFE_TREE_MAX_DAYS = 90;
export const CONTEXT_LIFE_TREE_PER_LANE_MAX = 500;
export const CONTEXT_LIFE_TREE_TOTAL_MAX = 2000;
export const CONTEXT_LIFE_TREE_TEMPORAL_ROLES = Object.freeze(["occurred", "observed", "state_change", "planned"]);
export const CONTEXT_LIFE_TREE_DEFAULT_TEMPORAL_ROLES = Object.freeze(["occurred", "observed", "state_change"]);
export const CONTEXT_LIFE_TREE_CHANGE_INTERVAL_BASES = Object.freeze([
  "bounded_by_node_observations",
  "confirmed_absence_receipt_threshold",
  "bounded_by_delete_receipt_and_primary_receipt",
  "first_observed_upper_bound_only",
  "receipt_order_only_clock_skew",
  "exact_order_blocked_clock_skew",
]);

const PROJECT_SEG_RE = /^[A-Za-z0-9가-힣][A-Za-z0-9가-힣._-]*$/;
const ACCEPTED_VOICE_REVIEW_STATES = new Set([
  "pending_review", "needs_review", "triaged", "ready", "reviewed", "approved", "corrected", "completed",
]);

const LANE_DEFS = Object.freeze([
  { lane: "mail_received", label: "받은 메일", status: "available", sources: ["core_mail"] },
  { lane: "mail_sent", label: "보낸 메일", status: "available", sources: ["core_mail"] },
  { lane: "erp_work", label: "ERP 작업 이력", status: "available", sources: ["event_log"] },
  { lane: "se_planned", label: "SE 예정", status: "available", sources: ["core_item", "core_meeting", "core_deliverable"] },
  { lane: "voice_intake", label: "승인 음성 인입", status: "available", sources: ["core_item"] },
  { lane: "codex_instruction", label: "Codex 사용자 지시", status: "available", sources: ["codex_thread_message"] },
  { lane: "artifact_metadata", label: "등록 산출물", status: "available", sources: ["core_artifact", "core_attachment", "core_deliverable", "deliverable_input"] },
  {
    lane: "general_activity", label: "일반 활동", status: "gap", sources: [],
    gap_reason: "no_canonical_general_activity_collector",
  },
  {
    lane: "file_activity", label: "파일 생성", status: "partial",
    sources: ["event_log", "deliverable_input", "file_activity_projection"],
    gap_reason: "general_filesystem_activity_unobserved",
  },
]);

export const CONTEXT_LIFE_TREE_LANES = Object.freeze(LANE_DEFS.map((row) => row.lane));
const LANE_BY_ID = new Map(LANE_DEFS.map((row) => [row.lane, row]));

function parseAllowlist(value, allowed, field) {
  if (value == null) return { values: [...allowed] };
  const raw = Array.isArray(value) ? value : String(value).split(",");
  const values = raw.map((entry) => String(entry ?? "").trim());
  if (!values.length || values.some((entry) => !entry || !allowed.includes(entry))) return { error: `${field}_invalid` };
  return { values: [...new Set(values)] };
}

export function parseContextLifeTreeQuery({ project, days, lanes, temporal_roles: temporalRoles } = {}) {
  const projectId = String(project ?? "").trim();
  if (!PROJECT_SEG_RE.test(projectId) || projectId.includes("..")) return { error: "project_invalid" };
  let dayCount = 30;
  if (days != null) {
    const raw = String(days).trim();
    if (!/^[1-9][0-9]*$/.test(raw)) return { error: "days_invalid" };
    dayCount = Number(raw);
    if (!Number.isSafeInteger(dayCount) || dayCount > CONTEXT_LIFE_TREE_MAX_DAYS) return { error: "days_invalid" };
  }
  const laneFilter = parseAllowlist(lanes, CONTEXT_LIFE_TREE_LANES, "lanes");
  if (laneFilter.error) return laneFilter;
  const roleFilter = parseAllowlist(
    temporalRoles == null ? CONTEXT_LIFE_TREE_DEFAULT_TEMPORAL_ROLES : temporalRoles,
    CONTEXT_LIFE_TREE_TEMPORAL_ROLES,
    "temporal_roles",
  );
  if (roleFilter.error) return roleFilter;
  return {
    project: projectId,
    days: dayCount,
    lanes: laneFilter.values,
    temporal_roles: roleFilter.values,
  };
}

function validDateKey(year, month, day) {
  const key = `${year}-${month}-${day}`;
  const probe = new Date(`${key}T00:00:00Z`);
  return Number.isFinite(probe.getTime()) && probe.toISOString().slice(0, 10) === key;
}

function parseTimestamp(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return { valid: false, present: false, value: null, ms: null, day_key: null, state: "unknown" };
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?(Z|[+-]\d{2}:?\d{2})?)?$/.exec(raw);
  if (!match || !validDateKey(match[1], match[2], match[3])) {
    return { valid: false, present: true, value: null, ms: null, day_key: null, state: "unknown" };
  }
  const dateKey = `${match[1]}-${match[2]}-${match[3]}`;
  if (match[4] == null) {
    const ms = Date.parse(`${dateKey}T00:00:00+09:00`);
    return { valid: true, present: true, value: dateKey, ms, day_key: dateKey, state: "date_only" };
  }
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6] ?? 0);
  if (hour > 23 || minute > 59 || second > 59) {
    return { valid: false, present: true, value: null, ms: null, day_key: null, state: "unknown" };
  }
  if (match[8] && match[8] !== "Z") {
    const offset = match[8].replace(":", "");
    const offsetHour = Number(offset.slice(1, 3));
    const offsetMinute = Number(offset.slice(3, 5));
    if (offsetHour > 14 || offsetMinute > 59 || (offsetHour === 14 && offsetMinute !== 0)) {
      return { valid: false, present: true, value: null, ms: null, day_key: null, state: "unknown" };
    }
  }
  const normalized = raw.replace(" ", "T");
  const zoned = Boolean(match[8]);
  const candidate = zoned ? normalized : `${normalized}+09:00`;
  const ms = Date.parse(candidate);
  if (!Number.isFinite(ms)) return { valid: false, present: true, value: null, ms: null, day_key: null, state: "unknown" };
  return {
    valid: true,
    present: true,
    value: new Date(ms).toISOString(),
    ms,
    day_key: new Date(ms + 9 * 3600000).toISOString().slice(0, 10),
    state: "exact",
  };
}

function strictIntervalTimestamp(value) {
  const raw = String(value ?? "").trim();
  if (!/(?:Z|[+-]\d{2}:?\d{2})$/.test(raw)) return null;
  const parsed = parseTimestamp(raw);
  return parsed.valid && parsed.state === "exact" ? parsed : null;
}

export function normalizeContextLifeTreeChangeInterval(value) {
  if (value == null) return { value: null };
  if (typeof value !== "object" || Array.isArray(value)) return { error: "change_interval_invalid" };
  const allowedKeys = ["after", "before", "basis"];
  const keys = Object.keys(value);
  if (keys.length !== allowedKeys.length || keys.some((key) => !allowedKeys.includes(key))) {
    return { error: "change_interval_invalid" };
  }
  const basis = String(value.basis ?? "").trim();
  if (!CONTEXT_LIFE_TREE_CHANGE_INTERVAL_BASES.includes(basis)) return { error: "change_interval_basis_invalid" };
  const before = strictIntervalTimestamp(value.before);
  if (!before) return { error: "change_interval_before_invalid" };
  const after = value.after == null ? null : strictIntervalTimestamp(value.after);
  if (basis === "first_observed_upper_bound_only") {
    if (value.after != null) return { error: "change_interval_after_must_be_null" };
  } else if (!after) {
    return { error: "change_interval_after_invalid" };
  }
  if (after && after.ms > before.ms) return { error: "change_interval_order_invalid" };
  return {
    value: {
      after: after?.value ?? null,
      before: before.value,
      basis,
    },
  };
}

export function projectContextLifeTreeTemporalEnvelope({
  temporal_role: temporalRole,
  primary_clock: primaryClock,
  occurred_at: occurredAt = null,
  observed_at: observedAt = null,
  recorded_at: recordedAt = null,
  ingested_at: ingestedAt = null,
  received_at: receivedAt = null,
  planned_for: plannedFor = null,
  change_interval: changeInterval = null,
} = {}) {
  if (!CONTEXT_LIFE_TREE_TEMPORAL_ROLES.includes(temporalRole)) return { error: "temporal_role_invalid" };
  const clocks = {
    occurred_at: parseTimestamp(occurredAt),
    observed_at: parseTimestamp(observedAt),
    recorded_at: parseTimestamp(recordedAt),
    ingested_at: parseTimestamp(ingestedAt),
    received_at: parseTimestamp(receivedAt),
    planned_for: parseTimestamp(plannedFor),
  };
  if (!Object.hasOwn(clocks, primaryClock)) return { error: "primary_clock_invalid" };
  const interval = normalizeContextLifeTreeChangeInterval(changeInterval);
  if (interval.error) return interval;
  const primary = clocks[primaryClock];
  return {
    envelope: {
      temporal_role: temporalRole,
      occurred_at: clocks.occurred_at.valid ? clocks.occurred_at.value : null,
      observed_at: clocks.observed_at.valid ? clocks.observed_at.value : null,
      recorded_at: clocks.recorded_at.valid ? clocks.recorded_at.value : null,
      ingested_at: clocks.ingested_at.valid ? clocks.ingested_at.value : null,
      received_at: clocks.received_at.valid ? clocks.received_at.value : null,
      planned_for: clocks.planned_for.valid ? clocks.planned_for.value : null,
      display_at: primary.valid ? primary.value : null,
      day_key: primary.valid ? primary.day_key : null,
      day: primary.valid ? primary.day_key : null,
      time_basis: primary.valid ? primaryClock : "undated",
      time_state: primary.state,
      display_state: primary.valid ? "dated" : "undated",
      change_interval: interval.value,
    },
    primary,
  };
}

function shiftDateKey(dateKey, days) {
  const date = new Date(`${dateKey}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function projectionWindow(nowRaw, days) {
  const nowMs = nowRaw instanceof Date ? nowRaw.getTime() : Date.parse(String(nowRaw ?? ""));
  if (!Number.isFinite(nowMs)) return { error: "as_of_invalid" };
  const today = new Date(nowMs + 9 * 3600000).toISOString().slice(0, 10);
  const actualFrom = shiftDateKey(today, -(days - 1));
  const actualToExclusive = shiftDateKey(today, 1);
  const plannedToExclusive = shiftDateKey(today, days);
  return {
    as_of: new Date(nowMs).toISOString(),
    timezone: "Asia/Seoul",
    actual_from: actualFrom,
    actual_through: today,
    planned_from: today,
    planned_through: shiftDateKey(today, days - 1),
    actual_start_ms: Date.parse(`${actualFrom}T00:00:00+09:00`),
    actual_end_ms: Date.parse(`${actualToExclusive}T00:00:00+09:00`),
    planned_start_ms: Date.parse(`${today}T00:00:00+09:00`),
    planned_end_ms: Date.parse(`${plannedToExclusive}T00:00:00+09:00`),
  };
}

function readCsvFields(filePath, fields) {
  if (!existsSync(filePath)) return [];
  try {
    const rows = parseCsv(readFileSync(filePath, "utf8").replace(/^﻿/, "").normalize("NFC"))
      .filter((row) => row.some((cell) => String(cell).trim()));
    if (!rows.length) return [];
    const header = rows[0].map((cell) => String(cell).trim());
    return rows.slice(1).map((row) => Object.fromEntries(fields.map((field) => [field, row[header.indexOf(field)] ?? ""])));
  } catch {
    return [];
  }
}

function addMapped(map, keyRaw, value) {
  const key = String(keyRaw ?? "").trim();
  if (!key) return;
  if (!map.has(key)) map.set(key, []);
  map.get(key).push(value);
}

function loadExactContextBindings(root, project) {
  const dir = join(resolve(root), "_workmeta", project, "project_context");
  const branches = readCsvFields(join(dir, "branches.csv"), [
    "branch_id", "project_code", "branch_key", "label", "branch_kind", "anchor_ref", "status",
  ]).filter((row) => row.project_code === project && String(row.branch_key).trim());
  const byRef = new Map();
  const byKey = new Map();
  for (const row of branches) {
    const branchKey = String(row.branch_key).trim();
    const expected = `branch:${project}:${branchKey}`;
    // branch_key alone is not an exact identity. A stale/corrupt branch_id must not be
    // canonicalized into a confirmed ref by the read projection.
    if (String(row.branch_id ?? "").trim() !== expected) continue;
    const branchRef = expected;
    const value = {
      ref: branchRef,
      branch_key: branchKey,
      label: String(row.label ?? "").trim() || branchKey,
      branch_kind: String(row.branch_kind ?? "").trim() || null,
      status: String(row.status ?? "").trim() || null,
      link_state: "confirmed_exact",
    };
    byRef.set(branchRef, value);
    byKey.set(branchKey, value);
  }

  const exactBySource = new Map();
  const exactByAnchor = new Map();
  const suggestedSources = new Set();
  let exactSourceBindingCount = 0;
  for (const row of branches) {
    const branch = byKey.get(String(row.branch_key).trim());
    if (branch) addMapped(exactByAnchor, row.anchor_ref, branch);
  }
  const sources = readCsvFields(join(dir, "sources.csv"), [
    "project_code", "source_kind", "external_ref", "branch_key", "branch_ref", "suggested_branch_ref",
  ]).filter((row) => row.project_code === project && String(row.external_ref).trim());
  for (const row of sources) {
    const sourceRef = String(row.external_ref).trim();
    const branchRef = String(row.branch_ref ?? "").trim();
    const branchKey = String(row.branch_key ?? "").trim();
    const branch = branchRef && byRef.get(branchRef) && byRef.get(branchRef).branch_key === branchKey
      ? byRef.get(branchRef)
      : null;
    const keys = new Set([sourceRef]);
    if (row.source_kind === "task_ledger" && !sourceRef.startsWith("item:")) keys.add(`item:${sourceRef}`);
    if (branch) {
      exactSourceBindingCount += 1;
      for (const key of keys) addMapped(exactBySource, key, branch);
    }
    if (!branch && String(row.suggested_branch_ref ?? "").trim()) for (const key of keys) suggestedSources.add(key);
  }

  const resolveRefs = (refsRaw) => {
    const refs = [...new Set((refsRaw ?? []).map((ref) => String(ref ?? "").trim()).filter(Boolean))];
    const links = new Map();
    for (const ref of refs) {
      for (const row of exactByAnchor.get(ref) ?? []) links.set(row.ref, row);
      for (const row of exactBySource.get(ref) ?? []) links.set(row.ref, row);
    }
    const exact = [...links.values()].sort((a, b) => a.ref.localeCompare(b.ref));
    if (exact.length === 1) return { state: "confirmed_exact", links: exact, reasons: [] };
    if (exact.length > 1) return { state: "review_needed", links: [], reasons: ["multiple_exact_context_links"] };
    if (refs.some((ref) => suggestedSources.has(ref))) {
      return { state: "review_needed", links: [], reasons: ["suggested_context_not_confirmed"] };
    }
    return { state: "unassigned", links: [], reasons: ["no_exact_context_link"] };
  };

  return {
    found: branches.length > 0 || sources.length > 0,
    branch_count: byRef.size,
    source_binding_count: exactSourceBindingCount,
    resolveRefs,
  };
}

function mailIdentityRefs(value, project) {
  const raw = String(value ?? "").trim();
  if (!raw) return [];
  const refs = new Set([raw]);
  if (raw.startsWith("mailcsv:")) refs.add(raw);
  else if (raw.startsWith(`${project}:`)) refs.add(`mailcsv:${raw.slice(project.length + 1)}`);
  return [...refs];
}

function itemIdentityRefs(itemId) {
  const id = String(itemId ?? "").trim();
  return id ? [id, `item:${id}`] : [];
}

function exactTaskLinks(itemIds) {
  return [...new Set((itemIds ?? []).map((id) => String(id ?? "").trim()).filter(Boolean))]
    .sort()
    .map((itemId) => ({ ref: `item:${itemId}`, item_id: itemId, link_state: "confirmed_exact" }));
}

function stableEventId(lane, kind, sourceRef) {
  const digest = createHash("sha256").update(`${lane}\n${kind}\n${sourceRef}`).digest("hex").slice(0, 24);
  return `life:${lane}:${digest}`;
}

function cleanMetadata(obj) {
  return Object.fromEntries(Object.entries(obj ?? {}).filter(([, value]) => value !== undefined && value !== null && value !== ""));
}

function cleanFileEvidenceRefs(values) {
  const allowed = /^(?:event_log:[1-9][0-9]*|file_activity:(?:obs|file-event):[a-f0-9]{64})$/u;
  const refs = [...new Set((values ?? []).map((value) => String(value ?? "").trim()).filter(Boolean))].sort();
  if (refs.some((ref) => !allowed.test(ref))) throw new Error("file_activity_evidence_ref_invalid");
  return refs;
}

function makeEvent({
  project, contextBindings, lane, kind, sourceRef, summaryLabel, temporalRole, primaryClock,
  occurredAt = null, observedAt = null, recordedAt = null, ingestedAt = null, receivedAt = null, plannedFor = null,
  changeInterval = null,
  state, metadata = {}, taskIds = [], contextRefs = [], uncertaintyReasons = [], evidenceRefs = [],
  sourceUncertaintyState = null, timeStateOverride = null,
}) {
  const temporal = projectContextLifeTreeTemporalEnvelope({
    temporal_role: temporalRole,
    primary_clock: primaryClock,
    occurred_at: occurredAt,
    observed_at: observedAt,
    recorded_at: recordedAt,
    ingested_at: ingestedAt,
    received_at: receivedAt,
    planned_for: plannedFor,
    change_interval: changeInterval,
  });
  if (temporal.error) throw new Error(temporal.error);
  const primary = temporal.primary;
  const taskLinks = exactTaskLinks(taskIds);
  const resolvedContext = contextBindings.resolveRefs([
    ...contextRefs,
    ...taskLinks.flatMap((link) => itemIdentityRefs(link.item_id)),
  ]);
  const timeReason = !primary.present ? "source_time_missing" : (!primary.valid ? "source_time_invalid" : null);
  const dateOnlyReason = primary.state === "date_only" ? "date_only_precision" : null;
  const reasons = [...new Set([
    ...resolvedContext.reasons,
    ...uncertaintyReasons,
    timeReason,
    dateOnlyReason,
  ].filter(Boolean))];
  const uncertaintyState = sourceUncertaintyState === "review_needed" || resolvedContext.state === "review_needed"
    ? "review_needed"
    : (
        sourceUncertaintyState === "partial" || !primary.valid || resolvedContext.state === "unassigned"
          ? "partial"
          : "confirmed"
      );
  const timeState = timeStateOverride ?? temporal.envelope.time_state;
  const eventId = stableEventId(lane, kind, sourceRef);
  return {
    event: {
      event_id: eventId,
      id: eventId,
      lane_id: lane,
      lane,
      source_record_ref: sourceRef,
      ref: sourceRef,
      kind,
      summary_label: String(summaryLabel ?? "").trim() || kind,
      title: String(summaryLabel ?? "").trim() || kind,
      ...temporal.envelope,
      time_state: timeState,
      state,
      project_binding: {
        state: "confirmed",
        ref: `project:${project.id}`,
        project_id: project.id,
        source: "exact_source_project_id",
      },
      project_links: [{ ref: `project:${project.id}`, project_id: project.id, link_state: "confirmed_exact" }],
      task_links: taskLinks,
      context_links: resolvedContext.links,
      uncertainty: {
        state: uncertaintyState,
        context: resolvedContext.state,
        time: primary.valid ? timeState : "missing_or_invalid",
        reasons,
      },
      metadata: cleanMetadata(metadata),
      ...(evidenceRefs.length ? { evidence_refs: cleanFileEvidenceRefs(evidenceRefs) } : {}),
    },
    sort_ms: primary.valid ? primary.ms : null,
  };
}

function inProjectionWindow(wrapper, window) {
  if (wrapper.sort_ms == null) return true; // invalid/missing timestamps are preserved under undated.
  if (wrapper.event.temporal_role === "planned") {
    return wrapper.sort_ms >= window.planned_start_ms && wrapper.sort_ms < window.planned_end_ms;
  }
  return wrapper.sort_ms >= window.actual_start_ms && wrapper.sort_ms < window.actual_end_ms;
}

function sortWrappers(a, b) {
  if (a.sort_ms == null && b.sort_ms != null) return 1;
  if (a.sort_ms != null && b.sort_ms == null) return -1;
  if (a.sort_ms != null && b.sort_ms != null && a.sort_ms !== b.sort_ms) return b.sort_ms - a.sort_ms;
  return a.event.event_id.localeCompare(b.event.event_id);
}

function uniqueWrappers(rows) {
  const byId = new Map();
  for (const row of rows) if (!byId.has(row.event.event_id)) byId.set(row.event.event_id, row);
  return [...byId.values()];
}

function buildDays(events) {
  const dayMap = new Map();
  const contextMap = new Map();
  const contextPriority = { confirmed_exact: 0, review_needed: 1, unassigned: 2 };
  for (const event of events) {
    const dayKey = event.day_key || "undated";
    if (!dayMap.has(dayKey)) dayMap.set(dayKey, new Map());
    let context;
    if (event.uncertainty.context === "confirmed_exact" && event.context_links.length === 1) {
      const link = event.context_links[0];
      context = {
        context_ref: link.ref,
        branch_key: link.branch_key,
        label: link.label,
        binding_state: "confirmed_exact",
      };
    } else if (event.uncertainty.context === "review_needed") {
      context = { context_ref: null, branch_key: null, label: "확인 필요", binding_state: "review_needed" };
    } else {
      context = { context_ref: null, branch_key: null, label: "미배정", binding_state: "unassigned" };
    }
    const contextKey = context.context_ref || context.binding_state;
    const contexts = dayMap.get(dayKey);
    if (!contexts.has(contextKey)) contexts.set(contextKey, { ...context, events: [] });
    contexts.get(contextKey).events.push(event);
    const globalKey = context.context_ref || context.binding_state;
    if (!contextMap.has(globalKey)) contextMap.set(globalKey, { ...context, event_count: 0 });
    contextMap.get(globalKey).event_count += 1;
  }
  const days = [...dayMap].map(([dayKey, contexts]) => ({
    day_key: dayKey,
    day: dayKey === "undated" ? null : dayKey,
    label: dayKey === "undated" ? "날짜 미상" : dayKey,
    state: dayKey === "undated" ? "undated" : "dated",
    contexts: [...contexts.values()].sort((a, b) =>
      (contextPriority[a.binding_state] - contextPriority[b.binding_state])
      || String(a.label).localeCompare(String(b.label), "ko")
      || String(a.context_ref ?? "").localeCompare(String(b.context_ref ?? ""))),
    event_count: [...contexts.values()].reduce((sum, row) => sum + row.events.length, 0),
  }));
  days.sort((a, b) => {
    if (a.day_key === "undated") return 1;
    if (b.day_key === "undated") return -1;
    return b.day_key.localeCompare(a.day_key);
  });
  const contextNodes = [...contextMap.values()].sort((a, b) =>
    (contextPriority[a.binding_state] - contextPriority[b.binding_state])
    || String(a.label).localeCompare(String(b.label), "ko")
    || String(a.context_ref ?? "").localeCompare(String(b.context_ref ?? "")));
  return { days, context_nodes: contextNodes };
}

function sourceWasTruncated(snapshot, keys) {
  return keys.some((key) => snapshot.truncated?.[key] === true);
}

const FILE_ACTIVITY_KIND_MAP = Object.freeze({
  file_first_observed: ["file_first_observed", "파일 최초 관측", "active"],
  observed: ["file_seen", "파일 재관측", "active"],
  touch: ["file_touched", "파일 메타데이터 변경 관측", "active"],
  content_revision: ["file_modified", "파일 내용 변경 관측", "active"],
  rename: ["file_renamed", "파일 이름 변경 관측", "active"],
  copy: ["file_copied", "파일 복사 관측", "active"],
  joined_shared_path: ["file_seen", "공유 파일 관측", "active"],
  cross_node_revision_unordered: ["file_conflict", "파일 개정 충돌", "conflict_review"],
  ambiguous_same_content_identity: ["file_conflict", "파일 정체성 확인 필요", "conflict_review"],
  stale_observation: ["file_seen", "과거 파일 개정 관측", "active"],
  hash_pending: ["file_hash_pending", "파일 해시 확인 대기", "pending"],
  held_packet_evidence: ["file_evidence_held", "파일 관측 근거 보류", "held"],
  missing_candidate: ["file_missing_candidate", "파일 부재 후보", "missing_candidate"],
  delete: ["file_deleted", "파일 삭제 확인", "deleted_after_confirmed_absence"],
  restore: ["file_restored", "파일 복구 관측", "active"],
});

function projectionUncertaintyReasons(row, projection, { correlation = null, includeCoverage = true } = {}) {
  const reasons = [];
  if (row.uncertainty !== "confirmed") reasons.push(`file_activity_${row.uncertainty}`);
  if (includeCoverage && projection.coverage_state !== "complete") reasons.push("file_activity_projection_partial");
  if (correlation === "unmatched") reasons.push("erp_exact_correlation_unmatched");
  if (correlation === "ambiguous") reasons.push("erp_exact_correlation_ambiguous");
  if (row.source_kind === "scanner_observation" && row.observed_at && row.ingested_at) {
    const skewMs = Math.abs(Date.parse(row.ingested_at) - Date.parse(row.observed_at));
    if (skewMs > 15 * 60 * 1000) reasons.push("exact_temporal_order_blocked_clock_skew");
    else if (skewMs > 5 * 60 * 1000) reasons.push("receipt_order_used_clock_skew");
  }
  return reasons;
}

function projectionUncertaintyState(row, projection, { correlation = null, includeCoverage = true } = {}) {
  if (correlation === "ambiguous" || ["review_needed", "conflict"].includes(row.uncertainty)) {
    return "review_needed";
  }
  if (
    correlation === "unmatched"
    || row.uncertainty === "partial"
    || (includeCoverage && projection.coverage_state !== "complete")
  ) return "partial";
  return null;
}

function projectionTiming(row) {
  if (row.source_kind === "reconciler_transition") {
    return { temporalRole: "state_change", primaryClock: "received_at", timeStateOverride: null };
  }
  const skewMs = Math.abs(Date.parse(row.ingested_at) - Date.parse(row.observed_at));
  if (skewMs > 5 * 60 * 1000 && row.received_at) {
    return { temporalRole: "observed", primaryClock: "received_at", timeStateOverride: "fallback" };
  }
  return { temporalRole: "observed", primaryClock: "observed_at", timeStateOverride: null };
}

function exactErpProjectionMatch(row, erpRow) {
  if (row.erp_upload_event_ref !== `event_log:${erpRow.id}`) return false;
  if (!erpRow.sha256 || row.content_id !== `sha256:${erpRow.sha256}`) return false;
  if (row.size_bytes !== null && erpRow.size !== null && erpRow.size !== undefined && row.size_bytes !== erpRow.size) return false;
  return true;
}

export function buildContextLifeTree(root, projectRaw, {
  store,
  days = 30,
  lanes = CONTEXT_LIFE_TREE_LANES,
  temporalRoles = CONTEXT_LIFE_TREE_DEFAULT_TEMPORAL_ROLES,
  now = new Date(),
  perLaneMax = CONTEXT_LIFE_TREE_PER_LANE_MAX,
  totalMax = CONTEXT_LIFE_TREE_TOTAL_MAX,
  scope = null,
} = {}) {
  const parsed = parseContextLifeTreeQuery({
    project: projectRaw,
    days,
    lanes,
    temporal_roles: temporalRoles,
  });
  if (parsed.error) return parsed;
  if (!store || typeof store.contextLifeTreeSources !== "function") return { error: "store_required" };
  const laneCap = Math.max(1, Math.min(CONTEXT_LIFE_TREE_PER_LANE_MAX, Math.trunc(Number(perLaneMax) || CONTEXT_LIFE_TREE_PER_LANE_MAX)));
  const totalCap = Math.max(1, Math.min(CONTEXT_LIFE_TREE_TOTAL_MAX, Math.trunc(Number(totalMax) || CONTEXT_LIFE_TREE_TOTAL_MAX)));
  const window = projectionWindow(now, parsed.days);
  if (window.error) return window;
  const selectedLanes = new Set(parsed.lanes);
  const selectedRoles = new Set(parsed.temporal_roles);
  const snapshot = store.contextLifeTreeSources(parsed.project, {
    lanes: selectedLanes,
    perSourceLimit: laneCap,
    scope,
    window,
  });
  if (snapshot.error) return snapshot;
  const fileActivityProjection = selectedLanes.has("file_activity")
    ? readFileActivityLifeTreeProjection(root, parsed.project, { scope })
    : null;
  const contextBindings = loadExactContextBindings(root, parsed.project);
  const project = snapshot.project;

  const mailTaskMap = new Map();
  for (const row of snapshot.rows.mail_item_links) {
    for (const rawRef of [row.origin_mail_id, row.source_mail_ref]) {
      for (const ref of mailIdentityRefs(rawRef, parsed.project)) {
        if (!mailTaskMap.has(ref)) mailTaskMap.set(ref, new Set());
        mailTaskMap.get(ref).add(String(row.item_id));
      }
    }
  }
  const linkedItemsForMail = (mailId) => {
    const ids = new Set();
    for (const ref of mailIdentityRefs(mailId, parsed.project)) {
      for (const itemId of mailTaskMap.get(ref) ?? []) ids.add(itemId);
    }
    return [...ids];
  };

  const runs = new Map();
  const setRun = (lane, wrappers, scanned, sourceKeys, preSkipped = 0) => runs.set(lane, {
    wrappers: uniqueWrappers(wrappers),
    scanned,
    pre_skipped: preSkipped,
    source_truncated: sourceWasTruncated(snapshot, sourceKeys),
  });

  for (const lane of ["mail_received", "mail_sent"]) {
    if (!selectedLanes.has(lane)) continue;
    const direction = lane === "mail_received" ? "in" : "out";
    const sourceRows = snapshot.rows.mail.filter((row) => row.direction === direction);
    setRun(lane, sourceRows.map((row) => {
      const taskIds = linkedItemsForMail(row.id);
      const contextRefs = [...mailIdentityRefs(row.id, parsed.project), ...taskIds.flatMap(itemIdentityRefs)];
      return makeEvent({
        project, contextBindings, lane,
        kind: lane === "mail_received" ? "mail_received" : "mail_sent",
        sourceRef: `core_mail:${row.id}`,
        summaryLabel: row.subject,
        temporalRole: "occurred",
        primaryClock: "occurred_at",
        occurredAt: row.at,
        state: direction === "in" ? "received" : "sent",
        taskIds,
        contextRefs,
        metadata: { direction, counterpart: row.counterpart, stage_code: row.stage_code },
      });
    }), sourceRows.length, [lane, "mail_item_links"]);
  }

  if (selectedLanes.has("erp_work")) {
    setRun("erp_work", snapshot.rows.work_events.map((row) => makeEvent({
      project, contextBindings,
      lane: "erp_work",
      kind: row.kind,
      sourceRef: `event_log:${row.id}`,
      summaryLabel: row.item_title ? `${row.kind} · ${row.item_title}` : row.kind,
      temporalRole: "state_change",
      primaryClock: "occurred_at",
      occurredAt: row.at,
      recordedAt: row.at,
      state: row.event_state || "recorded",
      taskIds: row.item_id ? [row.item_id] : [],
      contextRefs: row.item_id ? itemIdentityRefs(row.item_id) : [],
      uncertaintyReasons: row.item_link_withheld ? ["item_link_withheld_or_project_mismatch"] : [],
      metadata: { event_kind: row.kind, actor_ref: row.actor_ref, actor_kind: row.actor_kind },
    })), snapshot.rows.work_events.length, ["work_events"]);
  }

  if (selectedLanes.has("se_planned")) {
    const planned = [];
    for (const row of snapshot.rows.schedule_items) planned.push(makeEvent({
      project, contextBindings,
      lane: "se_planned", kind: "item_due", sourceRef: `core_item:${row.id}`,
      summaryLabel: row.title, temporalRole: "planned", primaryClock: "planned_for",
      recordedAt: row.created_at, plannedFor: row.due || row.anchor_date,
      state: row.status || "scheduled", taskIds: [row.id], contextRefs: itemIdentityRefs(row.id),
      metadata: {
        source_type: "schedule_item", status: row.status, assignee_ref: row.assignee_ref,
        work_type: row.work_type, stage_id: row.stage_id, anchor_stage_code: row.anchor_stage_code,
      },
    }));
    for (const row of snapshot.rows.meetings) planned.push(makeEvent({
      project, contextBindings,
      lane: "se_planned", kind: "meeting_planned", sourceRef: `core_meeting:${row.id}`,
      summaryLabel: row.title, temporalRole: "planned", primaryClock: "planned_for",
      recordedAt: row.created_at, plannedFor: row.at, state: "scheduled",
      contextRefs: [`meeting:${row.id}`], metadata: { source_type: "meeting" },
    }));
    for (const row of snapshot.rows.deliverables) planned.push(makeEvent({
      project, contextBindings,
      lane: "se_planned", kind: "deliverable_due", sourceRef: `core_deliverable:${row.id}`,
      summaryLabel: row.name, temporalRole: "planned", primaryClock: "planned_for",
      plannedFor: row.due, state: row.produced ? "produced" : "scheduled",
      contextRefs: [`deliverable:${row.id}`],
      metadata: {
        source_type: "deliverable", stage_code: row.stage_code, deliverable_no: row.deliverable_no,
        due_source: row.due_source, submit_type: row.submit_type, produced: Boolean(row.produced), review_stage: row.review_stage,
      },
    }));
    setRun("se_planned", planned,
      snapshot.rows.schedule_items.length + snapshot.rows.meetings.length + snapshot.rows.deliverables.length,
      ["schedule_items", "meetings", "deliverables"]);
  }

  if (selectedLanes.has("voice_intake")) {
    const acceptedRows = snapshot.rows.voice_items.filter((row) => ACCEPTED_VOICE_REVIEW_STATES.has(String(row.review_status ?? "").trim()));
    setRun("voice_intake", acceptedRows.map((row) => makeEvent({
      project, contextBindings,
      lane: "voice_intake", kind: "voice_intake", sourceRef: `core_item:${row.id}`,
      summaryLabel: row.title, temporalRole: "state_change", primaryClock: "ingested_at",
      recordedAt: row.created_at, ingestedAt: row.created_at, state: "intake_accepted",
      taskIds: [row.id], contextRefs: itemIdentityRefs(row.id),
      uncertaintyReasons: ["voice_occurrence_clock_unavailable"],
      metadata: {
        status: row.status, review_status: row.review_status, assignee_ref: row.assignee_ref,
        work_type: row.work_type, anchor_stage_code: row.anchor_stage_code,
      },
    })), snapshot.rows.voice_items.length, ["voice_items"], snapshot.rows.voice_items.length - acceptedRows.length);
  }

  if (selectedLanes.has("codex_instruction")) {
    setRun("codex_instruction", snapshot.rows.codex_instructions.map((row) => makeEvent({
      project, contextBindings,
      lane: "codex_instruction", kind: "codex_user_instruction", sourceRef: `codex_thread_message:${row.id}`,
      summaryLabel: row.item_title ? `사용자 지시 기록 · ${row.item_title}` : "사용자 지시 기록",
      temporalRole: "state_change", primaryClock: "recorded_at", recordedAt: row.at,
      state: "instruction_recorded", taskIds: [row.item_id], contextRefs: itemIdentityRefs(row.item_id),
      uncertaintyReasons: ["message_text_withheld"],
      metadata: {
        role: "user", actor_ref: row.actor_ref, mode: row.mode,
        payload_byte_length: row.payload_byte_length, item_status: row.item_status,
      },
    })), snapshot.rows.codex_instructions.length, ["codex_instructions"]);
  }

  if (selectedLanes.has("artifact_metadata")) {
    const artifacts = [];
    for (const row of snapshot.rows.artifacts) artifacts.push(makeEvent({
      project, contextBindings,
      lane: "artifact_metadata", kind: "artifact_updated", sourceRef: `core_artifact:${row.id}`,
      summaryLabel: row.title, temporalRole: "state_change", primaryClock: "recorded_at",
      recordedAt: row.updated_at, state: "registered", contextRefs: [`artifact:${row.id}`],
      metadata: { source_type: "artifact", kind: row.kind, sha256: row.sha256 },
    }));
    for (const row of snapshot.rows.attachments) artifacts.push(makeEvent({
      project, contextBindings,
      lane: "artifact_metadata", kind: "attachment_registered", sourceRef: `core_attachment:${row.id}`,
      summaryLabel: row.name, temporalRole: "state_change", primaryClock: "recorded_at",
      recordedAt: row.created_at, state: "registered", taskIds: row.item_id ? [row.item_id] : [],
      contextRefs: [`${row.entity_type}:${row.entity_id}`],
      metadata: {
        source_type: "attachment", entity_type: row.entity_type, kind: row.kind,
        category: row.category, artifact_type: row.artifact_type, created_by: row.created_by,
      },
    }));
    for (const row of snapshot.rows.deliverables) artifacts.push(makeEvent({
      project, contextBindings,
      lane: "artifact_metadata", kind: "deliverable_registered", sourceRef: `core_deliverable:${row.id}`,
      summaryLabel: row.name, temporalRole: "state_change", primaryClock: "recorded_at",
      plannedFor: row.due, state: row.produced ? "produced" : "registered",
      contextRefs: [`deliverable:${row.id}`], uncertaintyReasons: ["registration_timestamp_unavailable"],
      metadata: {
        source_type: "deliverable", stage_code: row.stage_code, deliverable_no: row.deliverable_no,
        submit_type: row.submit_type, produced: Boolean(row.produced), review_stage: row.review_stage,
      },
    }));
    for (const row of snapshot.rows.deliverable_inputs) artifacts.push(makeEvent({
      project, contextBindings,
      lane: "artifact_metadata", kind: "deliverable_input_registered", sourceRef: `deliverable_input:${row.id}`,
      summaryLabel: "산출물 입력 등록", temporalRole: "state_change", primaryClock: "recorded_at",
      recordedAt: row.created_at, state: row.status || "registered",
      contextRefs: row.deliverable_id ? [`deliverable:${row.deliverable_id}`] : [],
      metadata: {
        source_type: "deliverable_input", deliverable_id: row.deliverable_id, stage_code: row.stage_code,
        intake_source: row.source, sha256: row.sha256, size: row.size, status: row.status,
      },
    }));
    setRun("artifact_metadata", artifacts,
      snapshot.rows.artifacts.length + snapshot.rows.attachments.length + snapshot.rows.deliverables.length + snapshot.rows.deliverable_inputs.length,
      ["artifacts", "attachments", "deliverables", "deliverable_inputs"]);
  }

  if (selectedLanes.has("file_activity")) {
    const projectionRows = fileActivityProjection?.events ?? [];
    const correlatedByEventRef = new Map();
    for (const row of projectionRows) {
      if (!row.erp_upload_event_ref) continue;
      if (!correlatedByEventRef.has(row.erp_upload_event_ref)) correlatedByEventRef.set(row.erp_upload_event_ref, []);
      correlatedByEventRef.get(row.erp_upload_event_ref).push(row);
    }
    const mergedByErpId = new Map();
    const consumedProjectionIds = new Set();
    const ambiguousProjectionIds = new Set();
    for (const erpRow of snapshot.rows.file_activity_events) {
      const eventRef = `event_log:${erpRow.id}`;
      const exact = (correlatedByEventRef.get(eventRef) ?? []).filter((row) => exactErpProjectionMatch(row, erpRow));
      if (exact.length === 1) {
        mergedByErpId.set(erpRow.id, exact[0]);
        consumedProjectionIds.add(exact[0].source_event_id);
      } else if (exact.length > 1) {
        for (const row of exact) ambiguousProjectionIds.add(row.source_event_id);
      }
    }

    const erpWrappers = snapshot.rows.file_activity_events.map((row) => {
      const sourceRef = `event_log:${row.id}`;
      const merged = mergedByErpId.get(row.id) ?? null;
      return makeEvent({
        project, contextBindings,
        lane: "file_activity", kind: "erp_input_uploaded", sourceRef,
        summaryLabel: "입력 파일 업로드",
        temporalRole: "occurred", primaryClock: "occurred_at",
        occurredAt: row.at, recordedAt: row.at, ingestedAt: row.created_at,
        receivedAt: merged?.received_at ?? null,
        state: row.status || "received", contextRefs: row.deliverable_id ? [`deliverable:${row.deliverable_id}`] : [],
        uncertaintyReasons: merged
          ? projectionUncertaintyReasons(merged, fileActivityProjection, { includeCoverage: false })
          : [],
        sourceUncertaintyState: merged
          ? projectionUncertaintyState(merged, fileActivityProjection, { includeCoverage: false })
          : null,
        evidenceRefs: [sourceRef, ...(merged ? [`file_activity:${merged.source_event_id}`] : [])],
        metadata: {
          source_type: "erp_input_upload", input_id: row.input_id, deliverable_id: row.deliverable_id,
          stage_code: row.stage_code, intake_source: row.source,
          actor_ref: row.actor_ref, actor_kind: row.actor_kind,
          scanner_evidence_merged: Boolean(merged), scanner_event_kind: merged?.event_kind,
        },
      });
    });

    const scannerWrappers = projectionRows
      .filter((row) => !consumedProjectionIds.has(row.source_event_id))
      .map((row) => {
        const [kind, summaryLabel, state] = FILE_ACTIVITY_KIND_MAP[row.event_kind];
        const timing = projectionTiming(row);
        const correlation = ambiguousProjectionIds.has(row.source_event_id)
          ? "ambiguous"
          : row.erp_upload_event_ref ? "unmatched" : null;
        return makeEvent({
          project, contextBindings,
          lane: "file_activity", kind, sourceRef: `file_activity:${row.source_event_id}`,
          summaryLabel, temporalRole: timing.temporalRole, primaryClock: timing.primaryClock,
          observedAt: row.observed_at, ingestedAt: row.ingested_at, receivedAt: row.received_at,
          changeInterval: row.change_interval,
          state,
          contextRefs: [row.source_event_id, row.logical_file_id, row.revision_id].filter(Boolean),
          uncertaintyReasons: projectionUncertaintyReasons(row, fileActivityProjection, { correlation }),
          sourceUncertaintyState: projectionUncertaintyState(row, fileActivityProjection, { correlation }),
          timeStateOverride: timing.timeStateOverride,
          evidenceRefs: [`file_activity:${row.source_event_id}`],
          metadata: {
            source_type: "file_activity_projection", source_kind: row.source_kind,
            logical_file_id: row.logical_file_id, revision_id: row.revision_id,
            identity_claim: row.identity_claim, identity_basis: row.identity_basis,
            projection_uncertainty: row.uncertainty,
          },
        });
      });
    runs.set("file_activity", {
      wrappers: uniqueWrappers([...erpWrappers, ...scannerWrappers]),
      scanned: snapshot.rows.file_activity_events.length + projectionRows.length,
      pre_skipped: fileActivityProjection?.state === "rejected" ? 1 : 0,
      source_truncated: sourceWasTruncated(snapshot, ["file_activity_events"]) || fileActivityProjection?.truncated === true,
      projection: {
        state: fileActivityProjection?.state ?? "missing",
        coverage_state: fileActivityProjection?.coverage_state ?? "partial",
        read_mode: fileActivityProjection?.read_mode ?? "exact_precomputed_file_only",
        accessible_events: projectionRows.length,
        scope_withheld: fileActivityProjection?.scope_withheld === true,
        deduplicated_with_erp: consumedProjectionIds.size,
        truncated: fileActivityProjection?.truncated === true,
        gap_reasons: fileActivityProjection?.gap_reasons ?? ["projection_not_precomputed"],
        rejection_reason: fileActivityProjection?.rejection_reason ?? null,
        live_activation: false,
      },
    });
  }

  const selectedByLane = new Map();
  for (const [lane, run] of runs) {
    const accepted = run.wrappers
      .filter((wrapper) => selectedRoles.has(wrapper.event.temporal_role))
      .filter((wrapper) => inProjectionWindow(wrapper, window))
      .sort(sortWrappers);
    selectedByLane.set(lane, { ...run, accepted, capped: accepted.slice(0, laneCap) });
  }
  const combined = [...selectedByLane.values()].flatMap((run) => run.capped).sort(sortWrappers);
  const shownWrappers = combined.slice(0, totalCap);
  const shownIds = new Set(shownWrappers.map((row) => row.event.event_id));
  const events = shownWrappers.map((row) => row.event);

  const laneRows = parsed.lanes.map((lane) => {
    const def = LANE_BY_ID.get(lane);
    const run = selectedByLane.get(lane);
    const scopeWithheldReasons = [
      ...(snapshot.scope?.withheld_by_lane?.[lane] ?? []),
      ...(run?.projection?.scope_withheld ? ["file_activity_projection_account_scope_withheld"] : []),
    ];
    if (def.status === "gap") {
      return {
        lane: def.lane, lane_id: def.lane, label: def.label, status: "gap", sources: [],
        coverage: {
          scanned: 0, accepted: 0, shown: 0, skipped: 0, undated: 0, cap: laneCap, truncated: false,
          scope_limited: scopeWithheldReasons.length > 0,
          scope_withheld_reasons: scopeWithheldReasons,
        },
        gap_reason: def.gap_reason,
      };
    }
    const currentRun = run ?? { scanned: 0, pre_skipped: 0, source_truncated: false, accepted: [], capped: [] };
    const shown = currentRun.capped.filter((row) => shownIds.has(row.event.event_id));
    return {
      lane: def.lane,
      lane_id: def.lane,
      label: def.label,
      status: def.status,
      sources: def.sources,
      coverage: {
        scanned: currentRun.scanned,
        accepted: currentRun.accepted.length,
        shown: shown.length,
        skipped: Math.max(0, currentRun.scanned - currentRun.accepted.length),
        source_rejected: currentRun.pre_skipped,
        undated: shown.filter((row) => row.event.day_key == null).length,
        cap: laneCap,
        truncated: currentRun.source_truncated || currentRun.accepted.length > laneCap || shown.length < currentRun.capped.length,
        scope_limited: scopeWithheldReasons.length > 0,
        scope_withheld_reasons: scopeWithheldReasons,
        ...(currentRun.projection ? { projection: currentRun.projection } : {}),
      },
      gap_reason: def.gap_reason ?? null,
    };
  });

  const tree = buildDays(events);
  const acceptedTotal = [...selectedByLane.values()].reduce((sum, run) => sum + run.accepted.length, 0);
  const scannedTotal = [...selectedByLane.values()].reduce((sum, run) => sum + run.scanned, 0);
  const truncated = laneRows.some((row) => row.coverage.truncated) || combined.length > totalCap;
  const undatedCount = events.filter((event) => event.day_key == null).length;
  const gapLaneIds = laneRows.filter((row) => row.status === "gap" || row.status === "partial").map((row) => row.lane);
  const scopeWithheldLaneIds = laneRows.filter((row) => row.coverage.scope_limited).map((row) => row.lane);
  return {
    schema: CONTEXT_LIFE_TREE_SCHEMA,
    content_policy: "metadata_only",
    read_only: true,
    projection_state: "derived_not_source_truth",
    source_truth: {
      owner: "source_local_histories",
      mutated: false,
      sources: [...new Set(laneRows.flatMap((row) => row.sources))],
      project_context_role: "exact_binding_only",
    },
    project: { id: project.id, title: project.title, ref: `project:${project.id}` },
    project_id: project.id,
    as_of: window.as_of,
    query: {
      days: parsed.days,
      lanes: parsed.lanes,
      temporal_roles: parsed.temporal_roles,
      timezone: window.timezone,
      actual_from: window.actual_from,
      actual_through: window.actual_through,
      planned_from: window.planned_from,
      planned_through: window.planned_through,
    },
    contract: {
      grouping: "project_day_confirmed_context_event",
      ordering: "latest_first_undated_last",
      branch_binding: "exact_project_context_refs_only_no_fuzzy",
      date_only: "preserved_without_midnight_claim",
    },
    lanes: laneRows,
    lane_catalog: laneRows,
    events,
    days: tree.days,
    context_nodes: tree.context_nodes,
    counts: {
      scanned: scannedTotal,
      accepted: acceptedTotal,
      events: events.length,
      days: tree.days.length,
      contexts: tree.context_nodes.length,
      undated: undatedCount,
      per_lane_max: laneCap,
      total_max: totalCap,
      truncated,
    },
    coverage: {
      scanned: scannedTotal,
      accepted: acceptedTotal,
      shown: events.length,
      truncated,
      undated_count: undatedCount,
      gap_lane_ids: gapLaneIds,
      scope_limited: snapshot.scope?.limited === true,
      scope_withheld_lane_ids: scopeWithheldLaneIds,
    },
    access_scope: {
      mode: snapshot.scope?.mode ?? "all",
      limited: snapshot.scope?.limited === true,
    },
    gaps: laneRows.filter((row) => row.status === "gap" || row.status === "partial")
      .map((row) => ({ lane: row.lane, status: row.status, reason: row.gap_reason })),
    binding_coverage: {
      project_context_found: contextBindings.found,
      branches: snapshot.scope?.limited ? null : contextBindings.branch_count,
      source_bindings: snapshot.scope?.limited ? null : contextBindings.source_binding_count,
      confirmed_events: events.filter((event) => event.uncertainty.context === "confirmed_exact").length,
      review_needed_events: events.filter((event) => event.uncertainty.context === "review_needed").length,
      unassigned_events: events.filter((event) => event.uncertainty.context === "unassigned").length,
    },
  };
}

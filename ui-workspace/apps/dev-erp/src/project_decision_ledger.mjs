import { createHash } from "node:crypto";

import {
  DISPOSITIONS,
  isValidatedHourlyShadowCycle,
} from "./hourly_shadow_cycle_contract.mjs";

const PROJECT_CAPSULES = new WeakSet();
const ISO_8601_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?(?:Z|[+-]\d{2}:\d{2})$/;

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isTimestamp(value) {
  return typeof value === "string" && ISO_8601_RE.test(value) && Number.isFinite(Date.parse(value));
}

function deepFreeze(value, seen = new WeakSet()) {
  if (value === null || typeof value !== "object" || seen.has(value)) return value;
  seen.add(value);
  for (const key of Object.keys(value)) deepFreeze(value[key], seen);
  return Object.freeze(value);
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (isRecord(value)) {
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function cloneCycle(cycle) {
  return {
    cycle_id: cycle.cycle_id,
    project_ref: cycle.project_ref,
    occurred_at: cycle.occurred_at,
    observed_at: cycle.observed_at,
    kst_cutoff: cycle.kst_cutoff,
    model_ref: cycle.model_ref,
    prompt_sha256_ref: cycle.prompt_sha256_ref,
    policy_ref: cycle.policy_ref,
    output_schema_ref: cycle.output_schema_ref,
    permission_refs: [...cycle.permission_refs],
    context_mode: cycle.context_mode,
    trigger_identity: cycle.trigger_identity,
    trigger_digest: cycle.trigger_digest,
    source_reads: cycle.source_reads.map((sourceRead) => ({
      source: sourceRead.source,
      status: sourceRead.status,
      cursor_before: sourceRead.cursor_before,
      cursor_after: sourceRead.cursor_after,
      count: sourceRead.count,
      latest_time: sourceRead.latest_time,
      coverage_gap: sourceRead.coverage_gap,
      source_refs: [...sourceRead.source_refs],
      required: sourceRead.required,
    })),
    disposition: cycle.disposition,
    why_code: cycle.why_code,
    short_summary: cycle.short_summary,
    missing_context: [...cycle.missing_context],
    evidence_refs: [...cycle.evidence_refs],
    candidate_task_refs: [...cycle.candidate_task_refs],
    task_identity: cycle.task_identity,
    task_type: cycle.task_type,
    proposed_action: cycle.proposed_action,
    required_authority: cycle.required_authority,
    effect_counters: { ...cycle.effect_counters },
    hostile_markers: [...cycle.hostile_markers],
    supersedes_ref: cycle.supersedes_ref,
    correction_category: cycle.correction_category,
    is_bot_echo: cycle.is_bot_echo,
  };
}

// Data faults return immutable HOLD envelopes. Wrong API shapes, such as a non-array
// portfolio input, remain caller programming errors and may throw at that boundary.
function makeAppendEnvelope(status, holdCodes, receipt) {
  return deepFreeze({ status, hold_codes: [...new Set(holdCodes)], receipt });
}

function makeInspectionEnvelope(status, holdCodes, capsule) {
  return deepFreeze({ status, hold_codes: [...new Set(holdCodes)], capsule });
}

function makeReceipt({
  recordId = null,
  cycle,
  cursor,
  nextCursor = cursor + 1,
  disposition = cycle.disposition,
  reason = null,
  cycleSha256,
  prevRecordDigest = null,
  recordDigest = null,
}) {
  return deepFreeze({
    record_id: recordId,
    cycle_id: cycle.cycle_id,
    project_ref: cycle.project_ref,
    cursor,
    next_cursor: nextCursor,
    occurred_at: cycle.occurred_at,
    observed_at: cycle.observed_at,
    trigger_identity: cycle.trigger_identity,
    trigger_digest: cycle.trigger_digest,
    disposition,
    why_code: cycle.why_code,
    supersedes_ref: cycle.supersedes_ref,
    correction_category: cycle.correction_category,
    reason,
    cycle_sha256: cycleSha256,
    prev_record_digest: prevRecordDigest,
    record_digest: recordDigest,
  });
}

function makeReplayReceipt(originalReceipt, currentCursor) {
  // REPLAY retains the historical record cursor/digest but tells callers where a
  // new append would land now. This prevents stale replay receipts from advancing a cursor.
  return deepFreeze({ ...originalReceipt, next_cursor: currentCursor, reason: "EXACT_REPLAY" });
}

function makeCountMap() {
  return Object.create(null);
}

function increment(map, key) {
  map[key] = (map[key] ?? 0) + 1;
}

function compareObservedThenCursor(left, right) {
  const observedDelta = Date.parse(left.observed_at) - Date.parse(right.observed_at);
  return observedDelta !== 0 ? observedDelta : left.cursor - right.cursor;
}

export function isProjectDecisionCapsule(value) {
  return isRecord(value) && PROJECT_CAPSULES.has(value);
}

export function createInMemoryProjectDecisionLedger() {
  const recordsByProject = new Map();
  const cycleRecordsByProject = new Map();
  const exactReplayByProject = new Map();
  const triggersByProject = new Map();

  function appendCycle(validatedCycle, expectedCursor = undefined) {
    if (!isValidatedHourlyShadowCycle(validatedCycle)) {
      return makeAppendEnvelope("HOLD", ["INVALID_VALIDATED_CYCLE"], null);
    }
    if (expectedCursor !== undefined && (!Number.isSafeInteger(expectedCursor) || expectedCursor < 0)) {
      return makeAppendEnvelope("HOLD", ["INVALID_EXPECTED_CURSOR"], null);
    }

    const cycle = cloneCycle(validatedCycle);
    const projectRef = cycle.project_ref;
    const projectRecords = recordsByProject.get(projectRef) ?? [];
    const cycleSha256 = sha256(canonicalJson(cycle));
    const exactReplayMap = exactReplayByProject.get(projectRef) ?? new Map();
    const cycleRecordMap = cycleRecordsByProject.get(projectRef) ?? new Map();
    const triggerMap = triggersByProject.get(projectRef) ?? new Map();
    const currentCursor = projectRecords.length;

    if (exactReplayMap.has(cycleSha256)) {
      return makeAppendEnvelope("REPLAY", [], makeReplayReceipt(exactReplayMap.get(cycleSha256), currentCursor));
    }
    if (cycleRecordMap.has(cycle.cycle_id)) return makeAppendEnvelope("HOLD", ["DUPLICATE_CYCLE_ID"], null);
    if (expectedCursor !== undefined && expectedCursor !== currentCursor) {
      return makeAppendEnvelope("HOLD", ["CURSOR_MISMATCH"], null);
    }

    if (cycle.is_bot_echo) {
      return makeAppendEnvelope("NO_OP", [], makeReceipt({
        cycle,
        cursor: currentCursor,
        nextCursor: currentCursor,
        disposition: "APPLICATION_ECHO",
        reason: "BOT_ECHO_EXCLUDED",
        cycleSha256,
      }));
    }
    if (!cycle.supersedes_ref) {
      const existingTrigger = triggerMap.get(cycle.trigger_identity);
      if (existingTrigger?.latest_digest === cycle.trigger_digest) {
        return makeAppendEnvelope("NO_OP", [], makeReceipt({
          cycle,
          cursor: currentCursor,
          nextCursor: currentCursor,
          disposition: "NO_OP",
          reason: "IDENTICAL_TRIGGER_DIGEST",
          cycleSha256,
        }));
      }
    }
    if (cycle.supersedes_ref) {
      if (!cycleRecordMap.has(cycle.supersedes_ref)) {
        return makeAppendEnvelope("HOLD", ["SUPERSEDES_TARGET_NOT_FOUND"], null);
      }
      if (cycle.correction_category === null) {
        return makeAppendEnvelope("HOLD", ["CORRECTION_CATEGORY_REQUIRED"], null);
      }
    }

    const recordId = `rec_${projectRef}_${String(currentCursor).padStart(6, "0")}_${sha256(cycle.cycle_id).slice(0, 8)}`;
    const prevRecordDigest = currentCursor === 0 ? null : projectRecords[currentCursor - 1].record_digest;
    const recordDigest = sha256(canonicalJson({
      record_id: recordId,
      project_ref: projectRef,
      cursor: currentCursor,
      cycle_sha256: cycleSha256,
      prev_record_digest: prevRecordDigest,
    }));
    const receipt = makeReceipt({
      recordId,
      cycle,
      cursor: currentCursor,
      cycleSha256,
      prevRecordDigest,
      recordDigest,
    });
    const record = deepFreeze({
      ...cycle,
      record_id: recordId,
      cursor: currentCursor,
      cycle_sha256: cycleSha256,
      prev_record_digest: prevRecordDigest,
      record_digest: recordDigest,
      receipt,
    });

    projectRecords.push(record);
    recordsByProject.set(projectRef, projectRecords);
    cycleRecordMap.set(cycle.cycle_id, record);
    cycleRecordsByProject.set(projectRef, cycleRecordMap);
    exactReplayMap.set(cycleSha256, receipt);
    exactReplayByProject.set(projectRef, exactReplayMap);
    triggerMap.set(cycle.trigger_identity, { latest_digest: cycle.trigger_digest, record_id: recordId });
    triggersByProject.set(projectRef, triggerMap);
    return makeAppendEnvelope("APPENDED", [], receipt);
  }

  function inspectProject(projectRef, asOf = null) {
    if (typeof projectRef !== "string" || projectRef.trim() === "") {
      return makeInspectionEnvelope("HOLD", ["INVALID_PROJECT_REF"], null);
    }
    if (asOf !== null && !isTimestamp(asOf)) return makeInspectionEnvelope("HOLD", ["INVALID_AS_OF"], null);

    const asOfMillis = asOf === null ? null : Date.parse(asOf);
    const matchingRecords = (recordsByProject.get(projectRef) ?? []).filter((record) => (
      asOfMillis === null || Date.parse(record.observed_at) <= asOfMillis
    ));
    const dispositionCounts = Object.fromEntries(DISPOSITIONS.map((disposition) => [disposition, 0]));
    const holdWhyCodeCounts = makeCountMap();
    const supersededCycleIds = new Set();
    let sourceReadCount = 0;

    for (const record of matchingRecords) {
      dispositionCounts[record.disposition] += 1;
      if (record.disposition === "HOLD") increment(holdWhyCodeCounts, record.why_code);
      if (record.supersedes_ref !== null) supersededCycleIds.add(record.supersedes_ref);
      for (const sourceRead of record.source_reads) {
        sourceReadCount += 1;
      }
    }

    const latestRecord = matchingRecords.length === 0 ? null : [...matchingRecords].sort(compareObservedThenCursor).at(-1);
    const headRecord = matchingRecords.length === 0 ? null : [...matchingRecords].sort((left, right) => left.cursor - right.cursor).at(-1);
    const activeProposals = matchingRecords
      .filter((record) => record.disposition === "PROPOSAL" && !supersededCycleIds.has(record.cycle_id))
      .map((record) => ({
        cycle_id: record.cycle_id,
        task_identity: record.task_identity,
        why_code: record.why_code,
        proposed_action: record.proposed_action,
        required_authority: record.required_authority,
      }));
    const capsule = deepFreeze({
      project_ref: projectRef,
      as_of: asOf,
      record_count: matchingRecords.length,
      next_cursor: headRecord === null ? 0 : headRecord.cursor + 1,
      head_record_digest: headRecord?.record_digest ?? null,
      latest_cursor: latestRecord?.cursor ?? null,
      latest_disposition: latestRecord?.disposition ?? null,
      latest_cycle_id: latestRecord?.cycle_id ?? null,
      latest_observed_at: latestRecord?.observed_at ?? null,
      active_proposals: activeProposals,
      disposition_counts: dispositionCounts,
      hold_why_code_counts: holdWhyCodeCounts,
      source_coverage_summary: {
        source_read_count: sourceReadCount,
      },
      superseded_record_count: matchingRecords.filter((record) => supersededCycleIds.has(record.cycle_id)).length,
    });
    PROJECT_CAPSULES.add(capsule);
    return makeInspectionEnvelope("INSPECTED", [], capsule);
  }

  return Object.freeze({ appendCycle, inspectProject });
}

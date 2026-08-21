export const HOURLY_SHADOW_CYCLE_SCHEMA = "soulforge.hourly_shadow_cycle.v1";
export const HOURLY_SHADOW_POLICY_REVISION = "soulforge.voice_first_bot_operating_model.v0_2";
export const REQUIRED_SOURCE_MANIFEST_VERSION = "soulforge.hourly_shadow_cycle.required_sources.v1";
export const REQUIRED_SOURCE_MANIFEST = Object.freeze({
  policy_ref: HOURLY_SHADOW_POLICY_REVISION,
  version: REQUIRED_SOURCE_MANIFEST_VERSION,
  required_sources: Object.freeze(["gmail", "linear"]),
});

export const DISPOSITIONS = Object.freeze(["NO_ACTION", "HOLD", "PROPOSAL", "MANAGER_DECISION"]);
export const AUTHORITIES = Object.freeze(["A0", "A1", "A2", "A3", "A4", "A5", "A6"]);
export const CONTEXT_MODES = Object.freeze(["live_only"]);
export const SOURCE_STATUSES = Object.freeze(["read", "empty", "partial", "unavailable"]);
export const TASK_TYPES = Object.freeze(["artifact_draft", "task_candidate", "follow_up", "evidence_review"]);
export const WHY_CODES = Object.freeze([
  "NEW_DELIVERABLE_REQUESTED",
  "NO_NEW_EVENT",
  "EVIDENCE_INSUFFICIENT",
  "COVERAGE_GAP",
  "OWNER_DECISION_REQUIRED",
  "MISSING_EVIDENCE",
  "IGNORE",
]);
export const CORRECTION_CATEGORIES = Object.freeze([
  "TAXONOMY_CORRECTION",
  "POLICY_CORRECTION",
  "EVIDENCE_CORRECTION",
  "ROUTING_CORRECTION",
]);
export const HOSTILE_MARKERS = Object.freeze([
  "prompt_injection",
  "cross_project_contamination",
  "contradiction",
  "stale_generation",
  "ambiguous_owner",
  "noise_duplicate",
]);
export const UNKNOWN_HOSTILE_MARKER = "UNKNOWN_HOSTILE_MARKER";
export const EFFECT_COUNTER_KEYS = Object.freeze([
  "linear_mutations",
  "gmail_sends",
  "slack_posts",
  "calendar_mutations",
  "drive_mutations",
  "external_calls",
]);

const VALIDATED_CYCLES = new WeakSet();
const SHA256_HEX_RE = /^[a-f0-9]{64}$/;
const PROJECT_REF_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const SAFE_TOKEN_RE = /^[A-Za-z0-9][A-Za-z0-9._:@/_-]{0,127}$/;
const ISO_8601_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?(?:Z|[+-]\d{2}:\d{2})$/;
const MAX_PACKET_DEPTH = 12;
const MAX_PACKET_NODES = 256;
const MAX_SOURCE_READS = 16;
const MAX_PERMISSION_REFS = 16;
const MAX_CONTEXT_REFS = 32;
const MAX_EVIDENCE_REFS = 64;
const MAX_CANDIDATE_TASK_REFS = 32;
const MAX_SOURCE_REFS = 64;
const MAX_HOSTILE_MARKERS = 16;
const MAX_SHORT_SUMMARY_LENGTH = 240;
const FORBIDDEN_KEY_EXACT_RE = /^(prompt_body|raw_prompt|prompt_text|source_body|api_key|private_key|chain_of_thought|cot|thought)$/i;
const FORBIDDEN_KEY_FRAGMENTS = Object.freeze([
  "raw", "body", "content", "subject", "snippet", "message", "token", "path", "password", "secret",
  "credential", "cookie", "session", "transcript", "thinking", "reasoning",
]);
const PACKET_KEYS = Object.freeze([
  "cycle_id", "project_ref", "occurred_at", "observed_at", "kst_cutoff", "model_ref", "prompt_sha256_ref",
  "policy_ref", "output_schema_ref", "permission_refs", "context_mode", "trigger_identity", "trigger_digest",
  "source_reads", "disposition", "why_code", "short_summary", "missing_context", "evidence_refs",
  "candidate_task_refs", "task_identity", "task_type", "proposed_action", "required_authority", "effect_counters",
  "hostile_markers", "supersedes_ref", "correction_category", "is_bot_echo",
]);
const SOURCE_READ_KEYS = Object.freeze([
  "source", "status", "cursor_before", "cursor_after", "count", "latest_time", "coverage_gap", "source_refs", "required",
]);
const HOSTILE_MARKER_CODES = Object.freeze({
  prompt_injection: "PROMPT_INJECTION_DETECTED",
  cross_project_contamination: "CROSS_PROJECT_CONTAMINATION",
  contradiction: "CONTRADICTION_DETECTED",
  stale_generation: "STALE_GENERATION",
  ambiguous_owner: "AMBIGUOUS_OWNER",
  noise_duplicate: "NOISE_DUPLICATE_DETECTED",
});

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim() !== "";
}

function isSafeToken(value) {
  return typeof value === "string" && SAFE_TOKEN_RE.test(value);
}

function isNullableSafeToken(value) {
  return value === null || isSafeToken(value);
}

function isIsoTimestamp(value) {
  return isNonEmptyString(value) && ISO_8601_RE.test(value) && Number.isFinite(Date.parse(value));
}

function isNullableIsoTimestamp(value) {
  return value === null || isIsoTimestamp(value);
}

function isBoundedTokenArray(value, maximum) {
  return Array.isArray(value) && value.length <= maximum && value.every(isSafeToken);
}

function hasExactKeys(value, expectedKeys) {
  if (!isRecord(value)) return false;
  const keys = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  return keys.length === expected.length && keys.every((key, index) => key === expected[index]);
}

function deepFreeze(value, seen = new WeakSet()) {
  if (value === null || typeof value !== "object" || seen.has(value)) return value;
  seen.add(value);
  for (const key of Object.keys(value)) deepFreeze(value[key], seen);
  return Object.freeze(value);
}

function makeHold(codes) {
  return deepFreeze({ status: "HOLD", hold_codes: [...new Set(codes)], cycle: null });
}

function isForbiddenKey(key) {
  const normalized = key.toLowerCase();
  return FORBIDDEN_KEY_EXACT_RE.test(key) || FORBIDDEN_KEY_FRAGMENTS.some((fragment) => normalized.includes(fragment));
}

function scanUnsafeGraph(value, holdCodes, state = {
  ancestors: new Set(),
  visited: new WeakSet(),
  nodeCount: 0,
}, depth = 0) {
  if (value === null || typeof value !== "object") return;
  if (depth > MAX_PACKET_DEPTH || state.ancestors.has(value) || state.nodeCount >= MAX_PACKET_NODES) {
    holdCodes.push("MALFORMED_PACKET_GRAPH");
    return;
  }
  if (state.visited.has(value)) return;
  state.nodeCount += 1;
  state.visited.add(value);
  state.ancestors.add(value);
  if (Array.isArray(value)) {
    for (const entry of value) scanUnsafeGraph(entry, holdCodes, state, depth + 1);
  } else {
    for (const key of Object.keys(value)) {
      if (isForbiddenKey(key)) holdCodes.push("FORBIDDEN_PAYLOAD_FIELD");
      scanUnsafeGraph(value[key], holdCodes, state, depth + 1);
    }
  }
  state.ancestors.delete(value);
}

function validateExactKeys(value, expectedKeys, unknownCode, invalidCode, holdCodes) {
  if (!isRecord(value)) {
    holdCodes.push(invalidCode);
    return false;
  }
  const actualKeys = Object.keys(value);
  const expected = new Set(expectedKeys);
  if (actualKeys.some((key) => !expected.has(key))) holdCodes.push(unknownCode);
  if (!hasExactKeys(value, expectedKeys)) holdCodes.push(invalidCode);
  return hasExactKeys(value, expectedKeys);
}

function validateSourceRead(sourceRead, holdCodes) {
  const exactShape = validateExactKeys(
    sourceRead,
    SOURCE_READ_KEYS,
    "UNKNOWN_SOURCE_READ_FIELD",
    "INVALID_SOURCE_READ_ENTRY",
    holdCodes,
  );
  if (!exactShape) return;
  if (!isSafeToken(sourceRead.source)) holdCodes.push("INVALID_SOURCE_NAME");
  if (!SOURCE_STATUSES.includes(sourceRead.status)) holdCodes.push("INVALID_SOURCE_STATUS");
  if (!isNullableSafeToken(sourceRead.cursor_before) || !isNullableSafeToken(sourceRead.cursor_after)) {
    holdCodes.push("INVALID_SOURCE_CURSOR");
  }
  if (!Number.isSafeInteger(sourceRead.count) || sourceRead.count < 0) holdCodes.push("INVALID_SOURCE_READ_COUNT");
  if (!isNullableIsoTimestamp(sourceRead.latest_time)) holdCodes.push("INVALID_SOURCE_LATEST_TIME");
  if (typeof sourceRead.coverage_gap !== "boolean") holdCodes.push("INVALID_SOURCE_COVERAGE_GAP");
  if (!isBoundedTokenArray(sourceRead.source_refs, MAX_SOURCE_REFS)) holdCodes.push("INVALID_SOURCE_REFS");
  if (typeof sourceRead.required !== "boolean") {
    holdCodes.push("INVALID_SOURCE_REQUIRED");
  } else if (sourceRead.required !== REQUIRED_SOURCE_MANIFEST.required_sources.includes(sourceRead.source)) {
    holdCodes.push("SOURCE_REQUIRED_MISMATCH");
  }
}

function cloneSourceRead(sourceRead) {
  return {
    source: sourceRead.source,
    status: sourceRead.status,
    cursor_before: sourceRead.cursor_before,
    cursor_after: sourceRead.cursor_after,
    count: sourceRead.count,
    latest_time: sourceRead.latest_time,
    coverage_gap: sourceRead.coverage_gap,
    source_refs: [...sourceRead.source_refs],
    required: sourceRead.required,
  };
}

export function isValidatedHourlyShadowCycle(value) {
  return isRecord(value) && VALIDATED_CYCLES.has(value);
}

export function validateHourlyShadowCycle(packet) {
  try {
    if (!isRecord(packet)) return makeHold(["MALFORMED_PACKET"]);
    const holdCodes = [];
    const exactPacket = validateExactKeys(packet, PACKET_KEYS, "UNKNOWN_PACKET_FIELD", "INVALID_PACKET_FIELDS", holdCodes);
    scanUnsafeGraph(packet, holdCodes);

    if (!isSafeToken(packet.cycle_id)) holdCodes.push("INVALID_CYCLE_ID");
    if (typeof packet.project_ref !== "string" || !PROJECT_REF_RE.test(packet.project_ref)) holdCodes.push("INVALID_PROJECT_REF");
    if (!isIsoTimestamp(packet.occurred_at)) holdCodes.push("INVALID_OCCURRED_AT");
    if (!isIsoTimestamp(packet.observed_at)) holdCodes.push("INVALID_OBSERVED_AT");
    if (!isIsoTimestamp(packet.kst_cutoff)) holdCodes.push("INVALID_KST_CUTOFF");
    if (isIsoTimestamp(packet.occurred_at) && isIsoTimestamp(packet.observed_at)) {
      if (Date.parse(packet.occurred_at) > Date.parse(packet.observed_at)) holdCodes.push("OCCURRED_AFTER_OBSERVED");
      if (isIsoTimestamp(packet.kst_cutoff) && Date.parse(packet.kst_cutoff) < Date.parse(packet.occurred_at)) {
        holdCodes.push("KST_CUTOFF_BEFORE_OCCURRED");
      }
      if (isIsoTimestamp(packet.kst_cutoff) && Date.parse(packet.kst_cutoff) > Date.parse(packet.observed_at)) {
        holdCodes.push("KST_CUTOFF_AFTER_OBSERVED");
      }
    }
    if (!isSafeToken(packet.model_ref)) holdCodes.push("INVALID_MODEL_REF");
    if (typeof packet.prompt_sha256_ref !== "string" || !SHA256_HEX_RE.test(packet.prompt_sha256_ref)) {
      holdCodes.push("INVALID_PROMPT_DIGEST");
    }
    if (packet.policy_ref !== HOURLY_SHADOW_POLICY_REVISION) holdCodes.push("INVALID_POLICY_REF");
    if (packet.output_schema_ref !== HOURLY_SHADOW_CYCLE_SCHEMA) holdCodes.push("INVALID_OUTPUT_SCHEMA_REF");
    if (!isBoundedTokenArray(packet.permission_refs, MAX_PERMISSION_REFS) || packet.permission_refs.length === 0) {
      holdCodes.push("INVALID_PERMISSION_REFS");
    }
    if (!CONTEXT_MODES.includes(packet.context_mode)) holdCodes.push("ACCEPTED_CONTEXT_NOT_SUPPORTED");
    if (!isSafeToken(packet.trigger_identity)) holdCodes.push("INVALID_TRIGGER_IDENTITY");
    if (typeof packet.trigger_digest !== "string" || !SHA256_HEX_RE.test(packet.trigger_digest)) holdCodes.push("INVALID_TRIGGER_DIGEST");

    const sourceReadByName = new Map();
    if (!Array.isArray(packet.source_reads)) {
      holdCodes.push("INVALID_SOURCE_READS");
    } else {
      if (packet.source_reads.length < REQUIRED_SOURCE_MANIFEST.required_sources.length || packet.source_reads.length > MAX_SOURCE_READS) {
        holdCodes.push("INVALID_SOURCE_READS");
      }
      for (const sourceRead of packet.source_reads) {
        validateSourceRead(sourceRead, holdCodes);
        if (isRecord(sourceRead) && isSafeToken(sourceRead.source)) {
          if (sourceReadByName.has(sourceRead.source)) holdCodes.push("DUPLICATE_SOURCE_READ");
          sourceReadByName.set(sourceRead.source, sourceRead);
        }
      }
    }
    let requiredCoverageGap = false;
    let requiredUnavailable = false;
    for (const requiredSource of REQUIRED_SOURCE_MANIFEST.required_sources) {
      const sourceRead = sourceReadByName.get(requiredSource);
      if (!sourceRead || sourceRead.required !== true) {
        holdCodes.push("MISSING_REQUIRED_SOURCE");
        continue;
      }
      requiredCoverageGap ||= sourceRead.status === "partial" || sourceRead.coverage_gap === true;
      requiredUnavailable ||= sourceRead.status === "unavailable";
    }

    if (!DISPOSITIONS.includes(packet.disposition)) holdCodes.push("INVALID_DISPOSITION");
    if (requiredCoverageGap || requiredUnavailable) {
      holdCodes.push("COVERAGE_GAP");
      if (requiredUnavailable) holdCodes.push("SOURCE_UNAVAILABLE");
      if (packet.disposition !== "HOLD") holdCodes.push("COVERAGE_REQUIRES_HOLD");
      if (packet.disposition === "PROPOSAL") holdCodes.push("PROPOSAL_FORBIDDEN_ON_COVERAGE_GAP");
    }

    if (!WHY_CODES.includes(packet.why_code)) holdCodes.push("INVALID_WHY_CODE");
    if (typeof packet.short_summary !== "string" || packet.short_summary.length > MAX_SHORT_SUMMARY_LENGTH || /[\r\n]/.test(packet.short_summary)) {
      holdCodes.push("INVALID_SHORT_SUMMARY");
    }
    if (!isBoundedTokenArray(packet.missing_context, MAX_CONTEXT_REFS)) holdCodes.push("INVALID_MISSING_CONTEXT");
    if (!isBoundedTokenArray(packet.evidence_refs, MAX_EVIDENCE_REFS)) holdCodes.push("INVALID_EVIDENCE_REFS");
    if (!isBoundedTokenArray(packet.candidate_task_refs, MAX_CANDIDATE_TASK_REFS)) holdCodes.push("INVALID_CANDIDATE_TASK_REFS");
    if (!isNullableSafeToken(packet.task_identity)) holdCodes.push("INVALID_TASK_IDENTITY");
    if (packet.task_type !== null && !TASK_TYPES.includes(packet.task_type)) holdCodes.push("INVALID_TASK_TYPE");
    if (!isNullableSafeToken(packet.proposed_action)) holdCodes.push("INVALID_PROPOSED_ACTION");
    if (!isNullableSafeToken(packet.supersedes_ref)) holdCodes.push("INVALID_SUPERSEDES_REF");
    if (packet.correction_category !== null && !CORRECTION_CATEGORIES.includes(packet.correction_category)) {
      holdCodes.push("INVALID_CORRECTION_CATEGORY");
    }
    if (!AUTHORITIES.includes(packet.required_authority)) holdCodes.push("INVALID_REQUIRED_AUTHORITY");
    if (typeof packet.is_bot_echo !== "boolean") holdCodes.push("INVALID_BOT_ECHO");

    const exactEffectCounters = validateExactKeys(
      packet.effect_counters,
      EFFECT_COUNTER_KEYS,
      "UNKNOWN_EFFECT_COUNTER",
      "INVALID_EFFECT_COUNTERS",
      holdCodes,
    );
    if (exactEffectCounters) {
      for (const key of EFFECT_COUNTER_KEYS) {
        const count = packet.effect_counters[key];
        if (!Number.isSafeInteger(count) || count < 0) holdCodes.push("INVALID_EFFECT_COUNTERS");
        else if (count > 0) holdCodes.push("A0_EFFECT_INVARIANT_VIOLATED");
      }
    }

    if (!Array.isArray(packet.hostile_markers) || packet.hostile_markers.length > MAX_HOSTILE_MARKERS) {
      holdCodes.push("INVALID_HOSTILE_MARKERS");
    } else {
      for (const marker of packet.hostile_markers) {
        if (!isNonEmptyString(marker)) holdCodes.push("MALFORMED_HOSTILE_MARKER");
        else if (!HOSTILE_MARKERS.includes(marker)) holdCodes.push(UNKNOWN_HOSTILE_MARKER);
        else holdCodes.push(HOSTILE_MARKER_CODES[marker]);
      }
    }

    if (!exactPacket || holdCodes.length > 0) return makeHold(holdCodes);
    const cycle = deepFreeze({
      cycle_id: packet.cycle_id,
      project_ref: packet.project_ref,
      occurred_at: packet.occurred_at,
      observed_at: packet.observed_at,
      kst_cutoff: packet.kst_cutoff,
      model_ref: packet.model_ref,
      prompt_sha256_ref: packet.prompt_sha256_ref,
      policy_ref: HOURLY_SHADOW_POLICY_REVISION,
      output_schema_ref: HOURLY_SHADOW_CYCLE_SCHEMA,
      permission_refs: [...packet.permission_refs],
      context_mode: packet.context_mode,
      trigger_identity: packet.trigger_identity,
      trigger_digest: packet.trigger_digest,
      source_reads: packet.source_reads.map(cloneSourceRead),
      disposition: packet.disposition,
      why_code: packet.why_code,
      short_summary: packet.short_summary,
      missing_context: [...packet.missing_context],
      evidence_refs: [...packet.evidence_refs],
      candidate_task_refs: [...packet.candidate_task_refs],
      task_identity: packet.task_identity,
      task_type: packet.task_type,
      proposed_action: packet.proposed_action,
      required_authority: packet.required_authority,
      effect_counters: Object.fromEntries(EFFECT_COUNTER_KEYS.map((key) => [key, packet.effect_counters[key]])),
      hostile_markers: [...packet.hostile_markers],
      supersedes_ref: packet.supersedes_ref,
      correction_category: packet.correction_category,
      is_bot_echo: packet.is_bot_echo,
    });
    VALIDATED_CYCLES.add(cycle);
    return deepFreeze({ status: "VALIDATED", hold_codes: [], cycle });
  } catch {
    return makeHold(["MALFORMED_PACKET_GRAPH"]);
  }
}

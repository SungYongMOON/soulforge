import crypto from "node:crypto";

import {
  createSourceTimelineAnnotation,
  reduceSourceTimelineAnnotations,
  toKstDateTime,
} from "../shared/source_timeline_annotation.mjs";

export const voiceTimelineAdapterVersion = "soulforge.voice_timeline_adapter.v1";

const SPEECH_ACT_LABEL_MAP = Object.freeze({
  cancellation: "cancellation_or_hold",
  assignment: "assignment",
  request: "request",
  offer: "offer",
  commitment: "commitment",
  decision: "decision",
  open_question: "open_question",
  risk_or_issue: "risk_or_issue",
  status_update: "status_update",
  result_report: "result_report",
  acknowledgement: "acknowledgement",
  deadline_mention: "deadline_mention",
  reported_speech: "reported_speech",
  conditional_statement: "conditional_statement",
  context_statement: "context_statement",
});

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function safeRefOrNull(value) {
  const normalized = String(value ?? "").trim();
  return /^[A-Za-z0-9][A-Za-z0-9._:@+-]{0,255}$/u.test(normalized) ? normalized : null;
}

function milliseconds(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return null;
  return Math.max(0, Math.round(Number(value) * 1000));
}

function occurredAt(recordedAt, relativeStartMs) {
  const base = Date.parse(recordedAt);
  if (!Number.isFinite(base)) throw new Error("voice timeline requires a valid recording start date-time");
  return toKstDateTime(
    new Date(base + Number(relativeStartMs ?? 0)).toISOString(),
    "voice occurred_at",
  );
}

function normalized(value) {
  return String(value ?? "").normalize("NFKC").toLocaleLowerCase("ko");
}

function repeatedValueSpans(content, value) {
  const haystack = normalized(content);
  const needle = normalized(value);
  if (!needle) return [];
  const spans = [];
  let offset = 0;
  while (offset <= haystack.length - needle.length) {
    const found = haystack.indexOf(needle, offset);
    if (found < 0) break;
    spans.push({ start: found, end: found + needle.length });
    offset = found + Math.max(1, needle.length);
  }
  return spans;
}

function entityLabelKind(kind) {
  if (["person_mention", "person_alias"].includes(kind)) return "person_mention";
  if (["project_code_mention", "project_alias", "project_name"].includes(kind)) return "project_mention";
  if (["equipment", "equipment_name", "device", "device_name", "part_number"].includes(kind)) return "equipment_mention";
  if (["organization", "organization_name", "company", "supplier"].includes(kind)) return "organization_mention";
  if (kind === "measured_value") return "measured_value";
  if (kind === "date_or_period") return "date_or_period";
  return "keyword_mention";
}

function projectResolution(row) {
  const candidates = Array.isArray(row.project_match?.candidates) ? row.project_match.candidates : [];
  const top = candidates[0] ?? null;
  if (!top) {
    return { project_ref: null, resolution_state: "unassigned", basis_refs: [] };
  }
  const projectRef = safeRefOrNull(top.project_ref);
  if (!projectRef) {
    return { project_ref: null, resolution_state: "exception_review_required", basis_refs: [] };
  }
  return {
    project_ref: projectRef,
    resolution_state: row.project_match.state === "exception_review_required"
      ? "exception_review_required"
      : "candidate",
    basis_refs: [...new Set([
      safeRefOrNull(top.card_ref),
      ...(top.supporting_evidence ?? []).map((entry) => safeRefOrNull(entry.card_ref)),
    ].filter(Boolean))].sort(),
  };
}

function confidenceFor(run, material = false) {
  const evidenceRole = run.recording_ref?.evidence_role ?? "";
  const verified = evidenceRole.includes("verified_pair");
  const independent = evidenceRole.includes("independent_machine");
  if (verified) return { score: material ? 0.75 : 0.82, band: "medium", acoustic: 0.75 };
  if (independent) return { score: material ? 0.52 : 0.62, band: "medium", acoustic: 0.55 };
  return { score: material ? 0.3 : 0.4, band: "low", acoustic: null };
}

function buildAnnotation(run, row, input) {
  const relativeStartMs = input.relative_start_ms ?? milliseconds(row.start_seconds);
  const relativeEndMs = input.relative_end_ms ?? milliseconds(row.end_seconds);
  const project = projectResolution(row);
  const speakerRef = row.speaker_label && row.speaker_label !== "UNKNOWN"
    ? `speaker:${sha256(row.speaker_label).slice(0, 24)}`
    : null;
  const confidence = confidenceFor(run, input.material);
  return createSourceTimelineAnnotation({
    source_lane: "voice",
    item_id: safeRefOrNull(run.recording_ref.recording_id) ?? `recording:${sha256(run.recording_ref.recording_id).slice(0, 24)}`,
    source_revision_id: `transcript:${run.recording_ref.transcript_sha256.slice(0, 24)}`,
    body_sha256: run.recording_ref.transcript_sha256,
    source_unit_ref: row.unit_id,
    source_span_ref: input.source_span_ref,
    source_sequence: input.source_sequence,
    occurred_at: occurredAt(run.recording_ref.recorded_at, relativeStartMs),
    time_precision: input.time_precision ?? "segment",
    relative_start_ms: relativeStartMs,
    relative_end_ms: relativeEndMs,
    label_kind: input.label_kind,
    label_value: input.label_value,
    label_value_sha256: input.label_value_sha256,
    canonical_ref: safeRefOrNull(input.canonical_ref),
    project_ref: project.project_ref,
    project_resolution_state: project.resolution_state,
    project_basis_refs: project.basis_refs,
    speaker_ref: speakerRef,
    actor_refs: input.actor_refs ?? [],
    producer_kind: "deterministic",
    producer_ref: "voice_timeline_adapter_v1",
    policy_ref: "policy:source_timeline_v1",
    confidence_score: confidence.score,
    confidence_band: confidence.band,
    acoustic_score: confidence.acoustic,
    context_score: null,
  });
}

export function buildVoiceTimelineAnnotations({
  run,
  source_segments: sourceSegments,
  signal_occurrences: signalOccurrences = [],
}) {
  if (!run || run.schema_version !== "soulforge.voice_semantic_label_run.v1") {
    throw new Error("voice timeline requires a semantic label run");
  }
  if (!Array.isArray(sourceSegments) || sourceSegments.length === 0) {
    throw new Error("voice timeline requires source transcript segments");
  }
  const segmentById = new Map(sourceSegments.map((segment) => [String(segment.segment_id), segment]));
  const signalsByKey = new Map();
  for (const signal of signalOccurrences) {
    const key = `${signal.source_unit_ref}:${signal.signal_kind}:${signal.signal_code}`;
    const rows = signalsByKey.get(key) ?? [];
    rows.push(signal);
    signalsByKey.set(key, rows);
  }
  const annotations = [];
  let sourceSequence = 0;

  for (const row of run.segment_labels) {
    for (const speechAct of row.speech_acts) {
      const labelKind = SPEECH_ACT_LABEL_MAP[speechAct] ?? "unknown";
      const occurrences = signalsByKey.get(`${row.unit_id}:speech_act:${speechAct}`) ?? [null];
      for (const [index, occurrence] of occurrences.entries()) {
        const segment = occurrence?.source_segment_id === null
          ? null
          : segmentById.get(String(occurrence?.source_segment_id));
        annotations.push(buildAnnotation(run, row, {
          source_span_ref: occurrence?.source_segment_id !== null && occurrence
            ? `segment:${occurrence.source_segment_id}:chars:${occurrence.char_start}-${occurrence.char_end}:speech:${speechAct}:match:${index}`
            : `${row.unit_id}:speech:${speechAct}`,
          source_sequence: sourceSequence++,
          relative_start_ms: segment ? milliseconds(segment.start_seconds) : undefined,
          relative_end_ms: segment ? milliseconds(segment.end_seconds) : undefined,
          label_kind: labelKind,
          label_value: speechAct,
          material: !["context_statement", "acknowledgement"].includes(speechAct),
        }));
      }
    }
    for (const actionCode of row.action_codes) {
      const occurrences = signalsByKey.get(`${row.unit_id}:action:${actionCode}`) ?? [null];
      for (const [index, occurrence] of occurrences.entries()) {
        const segment = occurrence?.source_segment_id === null
          ? null
          : segmentById.get(String(occurrence?.source_segment_id));
        annotations.push(buildAnnotation(run, row, {
          source_span_ref: occurrence?.source_segment_id !== null && occurrence
            ? `segment:${occurrence.source_segment_id}:chars:${occurrence.char_start}-${occurrence.char_end}:action:${actionCode}:match:${index}`
            : `${row.unit_id}:action:${actionCode}`,
          source_sequence: sourceSequence++,
          relative_start_ms: segment ? milliseconds(segment.start_seconds) : undefined,
          relative_end_ms: segment ? milliseconds(segment.end_seconds) : undefined,
          label_kind: "action",
          label_value: actionCode,
          material: true,
        }));
      }
    }
    for (const entity of row.entities) {
      let emitted = 0;
      for (const segmentId of row.source_segment_ids) {
        const segment = segmentById.get(String(segmentId));
        if (!segment) continue;
        const spans = repeatedValueSpans(segment.content, entity.value);
        for (const [spanIndex, span] of spans.entries()) {
          annotations.push(buildAnnotation(run, row, {
            source_span_ref: `segment:${segmentId}:chars:${span.start}-${span.end}:match:${spanIndex}`,
            source_sequence: sourceSequence++,
            relative_start_ms: milliseconds(segment.start_seconds),
            relative_end_ms: milliseconds(segment.end_seconds),
            label_kind: entityLabelKind(entity.kind),
            label_value: entity.value,
            label_value_sha256: entity.value_sha256,
            canonical_ref: entity.person_ref ?? entity.project_ref ?? null,
            material: false,
          }));
          emitted += 1;
        }
      }
      if (emitted === 0) {
        annotations.push(buildAnnotation(run, row, {
          source_span_ref: `${row.unit_id}:entity:${entity.value_sha256.slice(0, 16)}`,
          source_sequence: sourceSequence++,
          label_kind: entityLabelKind(entity.kind),
          label_value: entity.value,
          label_value_sha256: entity.value_sha256,
          canonical_ref: entity.person_ref ?? entity.project_ref ?? null,
          material: false,
        }));
      }
    }
  }

  return reduceSourceTimelineAnnotations(annotations).annotations;
}

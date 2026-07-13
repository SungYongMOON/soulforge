import { fail } from "./errors.mjs";

const WINDOWS_ABSOLUTE = /(?<![A-Za-z0-9])(?:[A-Za-z]:[\\/](?![\\/])[^\s"'`<>|]+|\\\\[A-Za-z0-9._-]+[\\/][^\s"'`<>|]+)/gu;
const HOST_POSIX_ABSOLUTE = /\/(?:Users|home|var|tmp|private|opt)\/[^\s"'`<>]+/gu;
const KNOWN_SECRET = /\b(?:password|passwd|api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret)\s*[:=]\s*[^\s,;]+/i;
const PLACEHOLDER = /\{\{[^}\n]+\}\}/u;
const INTERNAL_SCHEMA_VALUE = /soulforge\.(?:workflow_receipt|workflow_job_outcome|semantic_preservation_audit|editorial_pass_record)\.v1/iu;
const AUDIT_FIELD = /\b(?:phase_transition_digest_before_receipt_confirmation|workflow_bundle_sha256|validator_summary|identity_attestation_ref|request_sha256|result_sha256|artifact_refs|pass_record|job_id)\b/giu;

function userFacingText(document) {
  const values = [document.title];
  for (const section of document.sections) {
    values.push(section.heading);
    for (const block of section.blocks) {
      if (block.type === "paragraph") values.push(block.text);
      else if (block.type === "bullets") values.push(...block.items.map((item) => item.text));
      else {
        values.push(block.caption, ...block.columns.map((column) => column.heading));
        for (const row of block.rows) values.push(row.label, ...row.cells.map((cell) => cell.text));
      }
    }
  }
  for (const item of document.unconfirmed_items) values.push(item.statement, item.impact, item.close_condition, item.due_or_trigger ?? "");
  return values.join("\n");
}

function rawPayloadCopyDetected(text, inputs) {
  for (const role of ["source_material", "owner_contract"]) {
    const input = inputs.get(role);
    if (!input || !input.ref.media_type.startsWith("text/")) continue;
    const raw = input.bytes.toString("utf8").trim();
    if (raw.length >= 128 && text.includes(raw)) return true;
  }
  return false;
}

function normalizedPath(value) {
  return value.normalize("NFKC").replace(/[),.;:]+$/u, "");
}

function extractedPaths(text) {
  return [...text.matchAll(WINDOWS_ABSOLUTE), ...text.matchAll(HOST_POSIX_ABSOLUTE)].map((match) => normalizedPath(match[0]));
}

function inputOwnsPath(candidate, inputs) {
  for (const input of inputs.values()) {
    if (!input?.ref?.media_type?.startsWith("text/") && input?.ref?.media_type !== "application/json") continue;
    const text = input.bytes.toString("utf8").normalize("NFKC");
    if (text.includes(candidate) || text.includes(candidate.replaceAll("\\", "\\\\"))) return true;
  }
  return false;
}

function structuralInternalLeak(text) {
  if (PLACEHOLDER.test(text)) return true;
  if (!INTERNAL_SCHEMA_VALUE.test(text)) return false;
  const fields = new Set([...text.matchAll(AUDIT_FIELD)].map((match) => match[0].toLowerCase()));
  return fields.size >= 2;
}

export function scanFinalReportBoundary(document, inputs) {
  const text = userFacingText(document);
  const paths = extractedPaths(text);
  const sourceOwnedPathCount = paths.filter((candidate) => inputOwnsPath(candidate, inputs)).length;
  const unapprovedPathCount = paths.length - sourceOwnedPathCount;
  const result = {
    content_classification: document.boundary.content_classification,
    raw_input_payload_copy_detected: rawPayloadCopyDetected(text, inputs),
    known_secret_pattern_scan_status: KNOWN_SECRET.test(text) ? "detected" : "pass",
    runtime_absolute_path_detected: unapprovedPathCount > 0,
    source_owned_absolute_path_count: sourceOwnedPathCount,
    forbidden_internal_scaffold_detected: structuralInternalLeak(text),
    limitation: "Known-pattern, provenance, and exact-copy guards are bounded detectors; they do not prove that all sensitive content is absent. Source-owned paths and legitimate technical vocabulary are not rejected by shape or word alone.",
  };
  if (result.raw_input_payload_copy_detected || result.known_secret_pattern_scan_status !== "pass" || result.runtime_absolute_path_detected || result.forbidden_internal_scaffold_detected) {
    fail("final_report_boundary_scan_failed", "Final report failed a deterministic boundary guard", { boundary: result });
  }
  return result;
}

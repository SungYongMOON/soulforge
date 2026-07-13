import { canonicalJson, sha256Canonical } from "./canonical.mjs";
import { validateReportDocument, validateSemanticManifest } from "./contract.mjs";
import { fail } from "./errors.mjs";

function identityOf(invariant) {
  return `${invariant.kind}\u0000${invariant.association_key}\u0000${invariant.occurrence}`;
}

function protectedPayload(invariant) {
  const payload = {
    kind: invariant.kind,
    association_key: invariant.association_key,
    occurrence: invariant.occurrence,
    anchor: { ...invariant.anchor },
    surface_form: invariant.surface_form,
    subject: invariant.subject,
    predicate: invariant.predicate,
    object: invariant.object,
    value: invariant.value,
    unit: invariant.unit,
    comparator: invariant.comparator,
    range: invariant.range,
    uncertainty: invariant.uncertainty,
    polarity: invariant.polarity,
    direction: invariant.direction,
    modality: invariant.modality,
    attribution: invariant.attribution,
    conditions: [...invariant.conditions].sort(),
    scope: [...invariant.scope].sort(),
    causality: invariant.causality,
    verdict: invariant.verdict,
    evidence_refs: [...invariant.evidence_refs].sort(),
  };
  for (const field of ["time_context", "location", "candidate_entity", "comparator_entity", "metric", "outcome", "coreference_target"]) {
    if (Object.hasOwn(invariant, field)) payload[field] = invariant[field];
  }
  for (const field of ["citation_bindings", "visual_bindings"]) {
    if (Object.hasOwn(invariant, field)) payload[field] = [...invariant[field]].sort();
  }
  return payload;
}

function inventory(manifest) {
  const map = new Map();
  for (const invariant of manifest.invariants) {
    map.set(identityOf(invariant), {
      invariant,
      payload: protectedPayload(invariant),
    });
  }
  return map;
}

function blockSurface(block, anchor) {
  if (block.type === "paragraph") return block.text;
  if (block.type === "bullets") return block.items.map((item) => item.text).join("\n");
  if (anchor.row_id !== null) {
    const row = block.rows.find((item) => item.row_id === anchor.row_id);
    if (!row) return null;
    const cell = row.cells.find((item) => item.column_id === anchor.column_id);
    return cell ? cell.text : null;
  }
  return [
    block.caption,
    ...block.columns.map((column) => column.heading),
    ...block.rows.flatMap((row) => [row.label, ...row.cells.map((cell) => cell.text)]),
  ].join("\n");
}

function countOccurrences(text, needle) {
  if (!needle.length) return 0;
  let count = 0;
  let offset = 0;
  while (offset <= text.length - needle.length) {
    const next = text.indexOf(needle, offset);
    if (next === -1) break;
    count += 1;
    offset = next + needle.length;
  }
  return count;
}

export function validateManifestSurfaceBindings(document) {
  validateReportDocument(document);
  const sections = new Map(document.sections.map((section) => [section.section_id, section]));
  const issues = [];
  for (const invariant of document.semantic_manifest.invariants) {
    if (invariant.anchor.section_id === "document") {
      const surface = invariant.anchor.block_id === "title" ? document.title
        : invariant.anchor.block_id === "report_date" ? document.report_date
          : null;
      if (surface === null) {
        issues.push({ invariant_id: invariant.invariant_id, code: "anchor_document_field_missing" });
      } else if (countOccurrences(surface, invariant.surface_form) < invariant.occurrence) {
        issues.push({ invariant_id: invariant.invariant_id, code: "surface_occurrence_missing", required_occurrence: invariant.occurrence });
      }
      continue;
    }
    const section = sections.get(invariant.anchor.section_id);
    if (!section) {
      issues.push({ invariant_id: invariant.invariant_id, code: "anchor_section_missing" });
      continue;
    }
    const block = section.blocks.find((item) => item.block_id === invariant.anchor.block_id);
    if (!block) {
      issues.push({ invariant_id: invariant.invariant_id, code: "anchor_block_missing" });
      continue;
    }
    if (invariant.anchor.row_id !== null && block.type !== "table") {
      issues.push({ invariant_id: invariant.invariant_id, code: "anchor_not_table" });
      continue;
    }
    const surface = blockSurface(block, invariant.anchor);
    if (surface === null) {
      issues.push({ invariant_id: invariant.invariant_id, code: "anchor_table_cell_missing" });
      continue;
    }
    if (countOccurrences(surface, invariant.surface_form) < invariant.occurrence) {
      issues.push({
        invariant_id: invariant.invariant_id,
        code: "surface_occurrence_missing",
        required_occurrence: invariant.occurrence,
      });
    }
  }
  return {
    status: issues.length === 0 ? "pass" : "fail",
    checked: document.semantic_manifest.invariants.length,
    issues,
  };
}

export function compareProtectedManifests(baselineManifest, candidateManifest) {
  validateSemanticManifest(baselineManifest, "$baseline_manifest");
  validateSemanticManifest(candidateManifest, "$candidate_manifest");
  const baseline = inventory(baselineManifest);
  const candidate = inventory(candidateManifest);
  const differences = [];
  let matched = 0;
  let missing = 0;
  let changed = 0;
  let unexpected = 0;

  if (baselineManifest.source_document_ref !== candidateManifest.source_document_ref) {
    changed += 1;
    differences.push({
      identity: "$manifest.source_document_ref",
      code: "source_document_ref_changed",
      baseline_sha256: sha256Canonical(baselineManifest.source_document_ref),
      candidate_sha256: sha256Canonical(candidateManifest.source_document_ref),
    });
  }

  for (const [identity, entry] of baseline) {
    const candidateEntry = candidate.get(identity);
    if (!candidateEntry) {
      missing += 1;
      differences.push({ identity, code: "missing_invariant" });
      continue;
    }
    if (canonicalJson(entry.payload) !== canonicalJson(candidateEntry.payload)) {
      changed += 1;
      differences.push({
        identity,
        code: "protected_value_changed",
        baseline_sha256: sha256Canonical(entry.payload),
        candidate_sha256: sha256Canonical(candidateEntry.payload),
      });
      continue;
    }
    matched += 1;
  }
  for (const identity of candidate.keys()) {
    if (!baseline.has(identity)) {
      unexpected += 1;
      differences.push({ identity, code: "unexpected_invariant" });
    }
  }
  differences.sort((a, b) => `${a.identity}:${a.code}`.localeCompare(`${b.identity}:${b.code}`));
  const counts = {
    baseline: baseline.size,
    candidate: candidate.size,
    matched,
    missing,
    changed,
    unexpected,
  };
  const sortedInventory = (entries) => [...entries]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, entry]) => entry.payload);
  const baselineInventory = sortedInventory(baseline.entries());
  const candidateInventory = sortedInventory(candidate.entries());
  return {
    schema: "soulforge.semantic_preservation_audit.v1",
    status: differences.length === 0 ? "pass" : "fail",
    baseline_inventory_sha256: sha256Canonical(baselineInventory),
    candidate_inventory_sha256: sha256Canonical(candidateInventory),
    counts,
    differences,
    limitation: "Deterministic checks detect declared protected-field drift; they do not guarantee semantic equivalence.",
  };
}

export function runDeterministicPreservation(baselineManifest, candidateDocument) {
  const comparison = compareProtectedManifests(baselineManifest, candidateDocument.semantic_manifest);
  const surface = validateManifestSurfaceBindings(candidateDocument);
  const result = {
    ...comparison,
    status: comparison.status === "pass" && surface.status === "pass" ? "pass" : "fail",
    surface_binding: surface,
  };
  if (result.status !== "pass") {
    fail("semantic_preservation_failed", "Protected semantic invariants changed or lost their declared surface binding", { audit: result });
  }
  return result;
}

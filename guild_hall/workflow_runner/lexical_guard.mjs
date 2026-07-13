import { sha256Canonical } from "./canonical.mjs";
import { validateReportDocument, validateSemanticManifest } from "./contract.mjs";
import { fail } from "./errors.mjs";

const TOKEN_PATTERNS = Object.freeze([
  {
    kind: "date",
    pattern: /\b(?:19|20)\d{2}[-/.](?:0?[1-9]|1[0-2])[-/.](?:0?[1-9]|[12]\d|3[01])\b|\b(?:19|20)\d{2}\s*년\s*(?:0?[1-9]|1[0-2])\s*월\s*(?:0?[1-9]|[12]\d|3[01])\s*일\b/gu,
  },
  {
    kind: "citation",
    pattern: /\[(?:\d+[a-z]?(?:\s*[-,]\s*\d+[a-z]?){0,8})\]|\((?:[A-Z][A-Za-z-]+(?:\s+et\s+al\.)?\s*,?\s*)?(?:19|20)\d{2}[a-z]?\)|\b(?:doi:\s*10\.\d{4,9}\/[^\s]+|RFC\s+\d+)\b/gu,
  },
  {
    kind: "identifier",
    pattern: /\b(?:[A-Z]{2,}[A-Z0-9]*(?:[-_/][A-Z0-9.]+)+|[A-Z]{2,}\s*\d{2,}[A-Z0-9.-]*|[A-Za-z]{1,8}-\d{2,}[A-Za-z0-9.-]*|v\d+(?:\.\d+)+)\b/gu,
  },
  {
    kind: "table_cell",
    pattern: /\b(?:PASS|FAIL|N\/?A)\b/gu,
  },
  {
    kind: "number",
    pattern: /(?:^|(?<![\p{L}\p{N}_]))(?:[<>≤≥]=?\s*)?(?:[+-]|±)?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?(?:\s*(?:±|\+\/-)\s*(?:\d+(?:\.\d+)?))?(?:\s*(?:-|–|—|~|to)\s*[+-]?(?:\d+(?:\.\d+)?))?(?:\s*(?:%|ppm|ppb|[numkMGT]?A|[numkMGT]?V|[numkMGT]?W|[numkMGT]?Hz|[numkMGT]?Ω|ohm|°C|K|Pa|bar|m|mm|cm|km|g|kg|s|ms|µs|us|ns|dB|[A-Za-zµμ°Ω]+\/[A-Za-z0-9µμ°Ω]+))?(?=$|[^\p{L}\p{N}_]|은|는|이|가|을|를|로|보다|에서|이며|였다|였고|였으며|였기|였음|이었고|이고|와|과)/gu,
  },
]);

function normalize(value) {
  return String(value).trim();
}

function overlaps(spans, start, end) {
  return spans.some(([left, right]) => start < right && end > left);
}

function collectTokens(text, collector) {
  const normalizedText = String(text);
  const protectedSpans = [];
  for (const { kind, pattern } of TOKEN_PATTERNS) {
    pattern.lastIndex = 0;
    for (const match of normalizedText.matchAll(pattern)) {
      const raw = normalize(match[0]);
      if (!raw) continue;
      const leading = match[0].length - match[0].trimStart().length;
      const start = match.index + leading;
      const end = start + match[0].trim().length;
      if (kind === "number" && overlaps(protectedSpans, start, end)) continue;
      collector(kind, raw);
      if (kind !== "number") protectedSpans.push([start, end]);
    }
  }
}

function markdownTableCells(text) {
  const cells = [];
  for (const line of text.split(/\r?\n/u)) {
    if (!line.includes("|")) continue;
    const values = line.trim().replace(/^\|/u, "").replace(/\|$/u, "").split("|").map(normalize);
    if (values.length < 2 || values.every((value) => /^:?-{3,}:?$/u.test(value))) continue;
    for (const value of values) if (value && !/^:?-{3,}:?$/u.test(value)) cells.push(value);
  }
  return cells;
}

function buildInventory({ scope, texts, tableCells }) {
  const counts = new Map();
  const collect = (kind, surfaceForm) => {
    const surface = normalize(surfaceForm);
    if (!surface) return;
    const key = `${kind}\u0000${surface}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  };
  for (const text of texts) collectTokens(text, collect);
  for (const cell of tableCells) collect("table_cell", cell);
  const items = [...counts.entries()].map(([key, occurrence]) => {
    const [kind, surface_form] = key.split("\u0000");
    return { kind, surface_form, occurrence };
  }).sort((left, right) => `${left.kind}\u0000${left.surface_form}`.localeCompare(`${right.kind}\u0000${right.surface_form}`));
  return {
    schema: "soulforge.lexical_guard_inventory.v1",
    scope,
    items,
    inventory_sha256: sha256Canonical({ scope, items }),
    limitation: "Deterministic lexical coverage protects detected tokens and table-cell text; it does not infer negation, modality, attribution, scope, causality, or source importance.",
  };
}

function documentSurfaces(document) {
  validateReportDocument(document);
  const texts = [document.title];
  if (document.report_date !== null) texts.push(document.report_date);
  const tableCells = [];
  for (const section of document.sections) {
    texts.push(section.heading);
    for (const block of section.blocks) {
      if (block.type === "paragraph") texts.push(block.text);
      else if (block.type === "bullets") texts.push(...block.items.map((item) => item.text));
      else {
        texts.push(block.caption, ...block.columns.map((column) => column.heading), ...block.rows.map((row) => row.label));
        for (const row of block.rows) {
          for (const cell of row.cells) {
            tableCells.push(cell.text);
          }
        }
      }
    }
  }
  for (const item of document.unconfirmed_items) {
    texts.push(item.statement, item.impact, item.close_condition);
    if (item.due_or_trigger) texts.push(item.due_or_trigger);
  }
  return { texts, tableCells };
}

export function extractDraftLexicalInventory(payload, structuredDocument = null) {
  if (structuredDocument) {
    const surfaces = documentSurfaces(structuredDocument);
    return buildInventory({ scope: "final_polish_input_draft", ...surfaces });
  }
  const text = Buffer.from(payload.bytes).toString("utf8");
  return buildInventory({ scope: "final_polish_input_draft", texts: [text], tableCells: markdownTableCells(text) });
}

export function extractAdoptedClaimInventory(document) {
  const surfaces = documentSurfaces(document);
  return buildInventory({ scope: "full_authoring_technical_content_adopted_claims", ...surfaces });
}

export function assertManifestCoversLexicalInventory(manifest, inventory) {
  validateSemanticManifest(manifest, "$lexical_coverage_manifest");
  const missing = [];
  for (const item of inventory.items) {
    const compatibleKinds = item.kind === "number" ? new Set(["number", "table_cell", "comparison"])
      : item.kind === "table_cell" ? new Set(["table_cell"])
        : item.kind === "identifier" ? new Set(["identifier", "citation", "table_cell"])
          : new Set([item.kind, "table_cell"]);
    const matches = manifest.invariants.filter((invariant) => compatibleKinds.has(invariant.kind) && normalize(invariant.surface_form) === item.surface_form);
    const coveredOccurrences = Math.max(matches.length, ...matches.map((invariant) => invariant.occurrence), 0);
    if (coveredOccurrences < item.occurrence) missing.push({ ...item, covered_occurrence: coveredOccurrences });
  }
  if (missing.length > 0) {
    fail("lexical_manifest_coverage_missing", "Protected baseline omitted deterministic draft tokens", {
      inventory_sha256: inventory.inventory_sha256,
      missing,
    });
  }
  return { status: "pass", checked: inventory.items.length, missing: [] };
}

export function verifyLexicalInventoryPreserved(inventory, document) {
  const surfaces = documentSurfaces(document);
  const candidate = buildInventory({ scope: inventory.scope, ...surfaces });
  const candidateMap = new Map(candidate.items.map((item) => [`${item.kind}\u0000${item.surface_form}`, item.occurrence]));
  const baselineKeys = new Set(inventory.items.map((item) => `${item.kind}\u0000${item.surface_form}`));
  const missing = [];
  for (const item of inventory.items) {
    const exact = candidateMap.get(`${item.kind}\u0000${item.surface_form}`) ?? 0;
    const fallback = item.kind === "table_cell"
      ? 0
      : candidate.items.filter((candidateItem) => candidateItem.surface_form === item.surface_form).reduce((total, candidateItem) => total + candidateItem.occurrence, 0);
    const actual = Math.max(exact, fallback);
    if (actual < item.occurrence) missing.push({ ...item, candidate_occurrence: actual });
  }
  const baselineSurfaces = new Set(inventory.items.map((item) => item.surface_form));
  const unexpected = candidate.items.filter((item) => {
    if (baselineKeys.has(`${item.kind}\u0000${item.surface_form}`)) return false;
    // A plain draft number/citation/identifier may be reconstructed as an
    // explicit table cell. The original protected surface must still exist;
    // newly invented cell values remain unexpected through their own token.
    if (item.kind === "table_cell" && baselineSurfaces.has(item.surface_form)) return false;
    return true;
  });
  const audit = {
    schema: "soulforge.lexical_guard_audit.v1",
    status: missing.length === 0 && unexpected.length === 0 ? "pass" : "fail",
    scope: inventory.scope,
    baseline_inventory_sha256: inventory.inventory_sha256,
    candidate_inventory_sha256: candidate.inventory_sha256,
    protected_count: inventory.items.length,
    missing,
    unexpected,
    limitation: inventory.limitation,
  };
  if (missing.length > 0 || unexpected.length > 0) fail("lexical_guard_preservation_failed", "A protected token was lost or a new numeric, date, identifier, citation, or table-cell surface was introduced", { audit });
  return audit;
}

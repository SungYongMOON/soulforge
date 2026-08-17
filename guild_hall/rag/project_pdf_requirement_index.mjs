// Project pdf requirement index seam. One pinned launch names one admitted
// project pdf, one fixed profile decides what a requirement identifier block is,
// and this seam either returns one closed, deep frozen requirement index with its
// payload free receipt or fails closed with an index of null. The admission seam
// stays the only thing that decides admission and touches the document bytes, and
// the recognition below is regular expressions over the returned page text alone.
// Nothing here reads or writes a file, calls a network or a model, touches a rag
// index, wiki, engine, erp or TaskDriver, keeps state between calls, or starts
// from a command line.
//
// The public request carries three own fields and no recognition knob: a caller
// that could name its own identifier pattern, gap, cap or title rule could widen
// what a requirement is allowed to be, so every bound below belongs to this seam
// and its profile and is only read back off its results.
import { createHash } from "node:crypto";
import { types } from "node:util";

import { extractAdmittedProjectPdfCandidate } from "./project_pdf_admission.mjs";

export const PROJECT_PDF_REQUIREMENT_INDEX_SCHEMA_VERSION =
  "soulforge.project_pdf_requirement_index.v0";
export const PROJECT_PDF_REQUIREMENT_INDEX_RECEIPT_SCHEMA_VERSION =
  "soulforge.project_pdf_requirement_index_receipt.v0";

// The fixed profile list. A profile is a closed recognition contract, not a
// caller supplied rule set, so the request may only name one of these. Both
// entries are this seam's own profiles: `v0_1` narrows what `v0` recognises and
// widens only what it reports, and neither is reachable as a caller supplied
// rule.
export const REQUIREMENT_INDEX_PROFILES = Object.freeze([
  "kr_defense_spec_v0",
  "kr_defense_spec_v0_1",
]);

const KR_DEFENSE_SPEC_PROFILE = "kr_defense_spec_v0";
const KR_DEFENSE_SPEC_V0_1_PROFILE = "kr_defense_spec_v0_1";

// One hash domain for the identifier roll-up. The block digest is a separate,
// plain content digest of the quoted block alone, so neither may ever be computed
// under the other's domain.
const IDS_FINGERPRINT_DOMAIN = "soulforge.project_pdf_requirement_index.ids.v0";

// The admitted shapes this seam accepts, restated rather than imported, so a
// renamed constant upstream cannot silently widen what is indexed.
const ADMITTED_CANDIDATE_SCHEMA_VERSION = "soulforge.admitted_project_pdf_candidate.v0";
const ADMITTED_CANDIDATE_KIND = "admitted_project_pdf_candidate";
const INGEST_CANDIDATE_SCHEMA_VERSION = "soulforge.project_document_ingest_candidate.v0";
const CANDIDATE_STATUS = "candidate";
const MEDIA_TYPE = "application/pdf";
const EXTRACTION_ENGINE = "pymupdf";
const FEATURE_STATE = "off";
const VALIDATION_ONLY_ROUTE = "validation_only";
const CANON_CLAIM_CEILING = "observed";
const RECEIPT_MODE = "read_only";

// The seam's own fixed bounds. None of them is reachable from the request.
const MAX_ROWS = 5000;
const MAX_MENTION_ONLY_IDS = 5000;
const MAX_TITLE_CHARS = 120;
const MAX_SECTION_CHARS = 64;
const MAX_IDENTIFIER_CHARS = 128;
// A label binds the first identifier that follows it closely enough to be the
// identifier that label announced. Anything further away is a mention.
const MAX_LABEL_GAP_CODE_UNITS = 64;
const MAX_ADMITTED_DEPTH = 8;

// The `kr_defense_spec_v0` recognition rules. Every one of them is a regular
// expression or a literal over page text: no model, no heuristic scoring and no
// layout inference decides what a requirement is.
const IDENTIFIER_TOKEN = /\bR[-_][A-Za-z0-9]+(?:[-_][A-Za-z0-9]+)+\b/gu;
const IDENTIFIER_LABEL = "식별자";
const SECTION_NUMBER = /^\d+(?:\.\d+)+\.?/u;
const BRACKET_TITLE = /\[([^\[\]\n\r]{1,120})\]/u;
const TBC_MARK = "TBC";
const TBD_MARK = "TBD";

// The `kr_defense_spec_v0_1` additions. Measured pages carry unit brackets such
// as `[mm]` and `[kg]` beside the requirement's own bracket title, and `v0`
// took whichever came first. `v0_1` reads a title only after the fixed
// requirement label, and skips a group that is short ascii, because a unit or a
// symbol is exactly that shape and a korean title never is.
const REQUIREMENT_LABEL = "요구사양";
const BRACKET_GROUP = /\[([^\[\]\n\r]{1,120})\]/gu;
const MAX_UNIT_BRACKET_CHARS = 4;
const ASCII_GROUP = /^[\x20-\x7e]+$/u;
// The identifier family is the identifier without its trailing ordinal, so
// `R-TB_PETB-HMR-001` and `R-TB_PETB-HMR-002` roll up under `R-TB_PETB-HMR`.
const IDENTIFIER_ORDINAL_SUFFIX = /[-_]\d+$/u;

// A bracket title is raw document text, so it is carried only when it cannot be
// a secret. A title that names a credential kind or carries one long opaque run
// is dropped to null rather than quoted, and the row survives without it.
const SECRET_LIKE_TITLE =
  /secret|token|password|passphrase|credential|api[ _-]?key|private[ _-]?key/iu;
const CREDENTIAL_HEADER = /bearer|authorization|-----BEGIN/iu;
const LONG_OPAQUE_RUN = /[A-Za-z0-9+/_-]{32,}/u;

const SHA256_HEX = /^[0-9a-f]{64}$/u;
const SHA256_CONTENT_ID = /^sha256:[0-9a-f]{64}$/u;
const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/u;
const LINE_FEED = 0x0a;
const CARRIAGE_RETURN = 0x0d;
const DELETE_CHARACTER = 0x7f;
const FIRST_PRINTABLE = 0x20;

const REQUEST_KEYS = Object.freeze(["launchPath", "expectedLaunchSha256", "profileId"]);
const ADMITTED_FIELDS = Object.freeze([
  "schema_version",
  "kind",
  "status",
  "feature_state",
  "route",
  "admission",
  "ingest_candidate",
  "authority",
  "effects",
]);
const ADMISSION_FIELDS = Object.freeze([
  "project_binding_ref",
  "document_revision_ref",
  "document_read_grant_ref",
  "knowledge_scope_fingerprint_sha256",
  "local_admission_fingerprint_sha256",
  "portable_material_fingerprint_sha256",
  "relative_locator_fingerprint_sha256",
  "knowledge_view_project_read_allowed",
  "document_read_grant_binding_verified",
]);
const INGEST_FIELDS = Object.freeze([
  "schema_version",
  "status",
  "source",
  "extraction",
  "authority",
  "effects",
]);
const INGEST_SOURCE_FIELDS = Object.freeze(["media_type", "sha256", "byte_count"]);
const EXTRACTION_FIELDS = Object.freeze([
  "engine",
  "page_count",
  "character_count",
  "text_sha256",
  "pages",
]);
const PAGE_FIELDS = Object.freeze(["page_number", "text"]);
const EXACT_REF_FIELDS = Object.freeze([
  "entity_id",
  "revision_id",
  "content_id",
  "content_hash_alg",
]);

// Fixed, payload free blockers. A refusal reports one of these and nothing else,
// so no path, locator, ref, page text, title or raw exception can ride out on it.
const BLOCKERS = Object.freeze({
  request_invalid: Object.freeze({
    code: "PROJECT_PDF_REQUIREMENT_INDEX_REQUEST_INVALID",
    stage: "request",
  }),
  admission_refused: Object.freeze({
    code: "PROJECT_PDF_REQUIREMENT_INDEX_ADMISSION_REFUSED",
    stage: "admission",
  }),
  extraction_shape_refused: Object.freeze({
    code: "PROJECT_PDF_REQUIREMENT_INDEX_EXTRACTION_SHAPE_REFUSED",
    stage: "extraction_shape",
  }),
  bound_exceeded: Object.freeze({
    code: "PROJECT_PDF_REQUIREMENT_INDEX_BOUND_EXCEEDED",
    stage: "requirement_index",
  }),
});

/**
 * Builds one requirement identifier index over one pinned, admitted project pdf.
 *
 * The order below is the safe sequence and is not an implementation detail: the
 * request is closed before admission is started, admission decides what may be
 * read, the indexed pages are the returned extraction alone, and every row is
 * bound to the page and the utf-16 span it was recognised in.
 */
export async function buildProjectPdfRequirementIndex(request) {
  const evidence = freshEvidence();
  const prepared = prepareRequest(request);
  if (prepared === null) return hold("request_invalid", evidence);
  evidence.profile_id = prepared.profileId;

  let candidate;
  try {
    candidate = await extractAdmittedProjectPdfCandidate({
      launchPath: prepared.launchPath,
      expectedLaunchSha256: prepared.expectedLaunchSha256,
    });
  } catch {
    // The admission seam's own refusals are already payload free, and none of
    // them is carried further than this fixed blocker.
    return hold("admission_refused", evidence);
  }
  const admitted = readAdmittedCandidate(candidate);
  if (admitted === null) return hold("extraction_shape_refused", evidence);
  recordAdmission(evidence, admitted);

  // `v0_1` is `v0` plus the diagnostics measurement asked for, so the extended
  // rules are decided here, once, off the accepted profile alone.
  const extended = prepared.profileId === KR_DEFENSE_SPEC_V0_1_PROFILE;
  const indexed = readRequirementIndex(admitted, extended);
  if (indexed === null) return hold("bound_exceeded", evidence);
  recordIndex(evidence, indexed);

  const index = {
    schema_version: PROJECT_PDF_REQUIREMENT_INDEX_SCHEMA_VERSION,
    profile_id: prepared.profileId,
    document: {
      sha256: `sha256:${admitted.source.sha256}`,
      page_count: admitted.extraction.page_count,
      character_count: admitted.extraction.character_count,
      text_sha256: `sha256:${admitted.extraction.text_sha256}`,
    },
    rows: indexed.rows,
    duplicate_ids: indexed.duplicate_ids,
    mention_only_ids: indexed.mention_only_ids,
  };
  // The `v0` index keeps exactly the keys it always had, so a reader pinned to
  // that profile cannot see one new field.
  if (extended) {
    index.mentions_by_id = indexed.mentions_by_id;
    index.malformed_labels = indexed.malformed_labels;
  }
  index.row_count = indexed.rows.length;
  return deepFreeze({ index, receipt: buildReceipt(evidence, null) });
}

// ---------------------------------------------------------------- request

// Closed own-data request. Three keys, all ordinary values, nothing else: no
// pattern, gap, cap, title rule, root or path override can be smuggled in beside
// them, and the profile must be one this seam already implements.
function prepareRequest(request) {
  if (!ordinaryDataObject(request)) return null;
  // Three own data fields on one ordinary object is the whole request contract,
  // so a root whose prototype was replaced is not that object and loses here,
  // before admission is started. Settled locally and not in the shared predicate,
  // which also bounds the admitted candidate, where a null prototype is part of
  // the frozen shape the admission seam may return.
  if (Object.getPrototypeOf(request) !== Object.prototype) return null;
  if (Reflect.ownKeys(request).length !== REQUEST_KEYS.length) return null;
  const values = [];
  for (const key of REQUEST_KEYS) {
    const descriptor = Object.getOwnPropertyDescriptor(request, key);
    if (descriptor === undefined || !Object.hasOwn(descriptor, "value")) return null;
    values.push(descriptor.value);
  }
  const [launchPath, expectedLaunchSha256, profileId] = values;
  // The launch path form is the admission seam's own contract and is left to it;
  // only the type is settled here, before anything is handed on.
  if (typeof launchPath !== "string" || launchPath.length === 0) return null;
  if (typeof expectedLaunchSha256 !== "string" || !SHA256_HEX.test(expectedLaunchSha256)) {
    return null;
  }
  if (typeof profileId !== "string" || !REQUIREMENT_INDEX_PROFILES.includes(profileId)) return null;
  // The recognition rules below are these two profiles' rules, so a listed
  // profile this seam does not implement is refused rather than silently indexed
  // as one of them.
  if (profileId !== KR_DEFENSE_SPEC_PROFILE && profileId !== KR_DEFENSE_SPEC_V0_1_PROFILE) {
    return null;
  }
  return { launchPath, expectedLaunchSha256, profileId };
}

function ordinaryDataObject(value) {
  if (value === null || typeof value !== "object") return false;
  // A proxy answers every later reflection with caller code and a revoked one
  // cannot answer at all, so the root is refused before the first trap capable
  // read. `Array.isArray` is one of those reads, so it stays behind this line.
  if (types.isProxy(value)) return false;
  if (Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function ordinaryDataArray(value) {
  if (value === null || typeof value !== "object") return false;
  if (types.isProxy(value)) return false;
  return Array.isArray(value) && Object.getPrototypeOf(value) === Array.prototype;
}

function exactKeys(value, expected) {
  if (!ordinaryDataObject(value)) return false;
  if (Reflect.ownKeys(value).length !== expected.length) return false;
  return expected.every((key) => Object.hasOwn(value, key));
}

// ---------------------------------------------------------------- admission

// The admitted candidate is re-read as a closed, deeply frozen data tree before
// one field of it is used. It arrives frozen from the admission seam, and a
// candidate that is not is not the candidate that seam returns.
function closedFrozenData(value, depth) {
  if (value === null || typeof value === "boolean" || typeof value === "string") return true;
  if (typeof value === "number") return Number.isSafeInteger(value);
  if (typeof value !== "object") return false;
  if (types.isProxy(value)) return false;
  if (!Object.isFrozen(value)) return false;
  if (depth >= MAX_ADMITTED_DEPTH) return false;
  const array = Array.isArray(value);
  const prototype = Object.getPrototypeOf(value);
  if (array
    ? prototype !== Array.prototype
    : prototype !== Object.prototype && prototype !== null) return false;
  let descriptors;
  try {
    descriptors = Object.getOwnPropertyDescriptors(value);
  } catch {
    return false;
  }
  for (const key of Reflect.ownKeys(descriptors)) {
    if (typeof key !== "string") return false;
    if (array && key === "length") continue;
    const descriptor = descriptors[key];
    if (!Object.hasOwn(descriptor, "value")) return false;
    if (!closedFrozenData(descriptor.value, depth + 1)) return false;
  }
  return true;
}

function validExactRef(ref) {
  return exactKeys(ref, EXACT_REF_FIELDS)
    && typeof ref.entity_id === "string" && SAFE_IDENTIFIER.test(ref.entity_id)
    && typeof ref.revision_id === "string" && SAFE_IDENTIFIER.test(ref.revision_id)
    && typeof ref.content_id === "string" && SHA256_CONTENT_ID.test(ref.content_id)
    && ref.content_hash_alg === "sha256";
}

function isSha256ContentId(value) {
  return typeof value === "string" && SHA256_CONTENT_ID.test(value);
}

function isSha256Hex(value) {
  return typeof value === "string" && SHA256_HEX.test(value);
}

// The admitted shape this seam is willing to index. Every field it later reports
// is bounded here first, and the cited revision must be the revision whose bytes
// were extracted, so an index can never be read back against a different document
// than the one that was pinned.
function readAdmittedCandidate(candidate) {
  if (!closedFrozenData(candidate, 0)) return null;
  if (!exactKeys(candidate, ADMITTED_FIELDS)
      || candidate.schema_version !== ADMITTED_CANDIDATE_SCHEMA_VERSION
      || candidate.kind !== ADMITTED_CANDIDATE_KIND
      || candidate.status !== CANDIDATE_STATUS
      || candidate.feature_state !== FEATURE_STATE
      || candidate.route !== VALIDATION_ONLY_ROUTE) return null;

  const admission = candidate.admission;
  if (!exactKeys(admission, ADMISSION_FIELDS)
      || !validExactRef(admission.project_binding_ref)
      || !validExactRef(admission.document_revision_ref)
      || !validExactRef(admission.document_read_grant_ref)
      || !isSha256ContentId(admission.knowledge_scope_fingerprint_sha256)
      || !isSha256ContentId(admission.local_admission_fingerprint_sha256)
      || !isSha256ContentId(admission.portable_material_fingerprint_sha256)
      || !isSha256ContentId(admission.relative_locator_fingerprint_sha256)
      || admission.knowledge_view_project_read_allowed !== false
      || admission.document_read_grant_binding_verified !== true) return null;

  const ingest = candidate.ingest_candidate;
  if (!exactKeys(ingest, INGEST_FIELDS)
      || ingest.schema_version !== INGEST_CANDIDATE_SCHEMA_VERSION
      || ingest.status !== CANDIDATE_STATUS
      || !exactKeys(ingest.source, INGEST_SOURCE_FIELDS)
      || ingest.source.media_type !== MEDIA_TYPE
      || !isSha256Hex(ingest.source.sha256)
      || !Number.isSafeInteger(ingest.source.byte_count) || ingest.source.byte_count < 1
      || admission.document_revision_ref.content_id !== `sha256:${ingest.source.sha256}`) {
    return null;
  }

  const extraction = ingest.extraction;
  if (!exactKeys(extraction, EXTRACTION_FIELDS)
      || extraction.engine !== EXTRACTION_ENGINE
      || !Number.isSafeInteger(extraction.page_count) || extraction.page_count < 1
      || !Number.isSafeInteger(extraction.character_count) || extraction.character_count < 0
      || !isSha256Hex(extraction.text_sha256)
      || !ordinaryDataArray(extraction.pages)
      || extraction.pages.length !== extraction.page_count) return null;
  let characters = 0;
  for (let index = 0; index < extraction.pages.length; index += 1) {
    const page = extraction.pages[index];
    if (!exactKeys(page, PAGE_FIELDS)
        || page.page_number !== index + 1
        || typeof page.text !== "string") return null;
    characters += page.text.length;
  }
  if (characters !== extraction.character_count) return null;

  return { admission, source: ingest.source, extraction };
}

// ---------------------------------------------------------------- recognition

// Every occurrence of the fixed label, as its own span and the offset just past
// it. The label is matched literally: korean page text carries no word boundary,
// so a label is a position and never a token. Binding reads `end` alone, exactly
// as before; `start` exists so a label that binds nothing can be reported as the
// span it occupied and never as the text it carried.
function labelPositions(text) {
  const positions = [];
  let from = text.indexOf(IDENTIFIER_LABEL);
  while (from !== -1) {
    positions.push({ start: from, end: from + IDENTIFIER_LABEL.length });
    from = text.indexOf(IDENTIFIER_LABEL, from + 1);
  }
  return positions;
}

// Every identifier shaped token on the page, in page order. A token past the
// identifier bound is not an identifier at all: it is neither a definition nor a
// mention, and a label that announced it stays unbound and is counted malformed.
function identifierTokens(text) {
  const tokens = [];
  for (const match of text.matchAll(IDENTIFIER_TOKEN)) {
    const id = match[0];
    if (id.length > MAX_IDENTIFIER_CHARS) continue;
    tokens.push({ id, start: match.index, end: match.index + id.length });
  }
  return tokens;
}

// Line starts, so the nearest preceding section number can be read off the page
// exactly as the extractor laid it out.
function lineStarts(text) {
  const starts = [0];
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code === CARRIAGE_RETURN && text.charCodeAt(index + 1) === LINE_FEED) index += 1;
    if (code === CARRIAGE_RETURN || code === LINE_FEED) starts.push(index + 1);
  }
  return starts;
}

// The section numbers this page carries, by the offset of the line each one
// opens. A row takes the last one that opens at or before its own block.
function sectionMarks(text) {
  const marks = [];
  for (const start of lineStarts(text)) {
    const lineEnd = lineEndFrom(text, start);
    const match = text.slice(start, lineEnd).match(SECTION_NUMBER);
    if (match === null || match[0].length > MAX_SECTION_CHARS) continue;
    marks.push({ start, section: match[0] });
  }
  return marks;
}

function lineEndFrom(text, start) {
  for (let index = start; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code === LINE_FEED || code === CARRIAGE_RETURN) return index;
  }
  return text.length;
}

function sectionAt(marks, position) {
  let found = null;
  for (const mark of marks) {
    if (mark.start > position) break;
    found = mark.section;
  }
  return found;
}

// One page, split into the definitions the label announced and the mentions it
// did not. The nearest preceding unbound label within the fixed gap binds a
// token; every other token is a mention, and every label left unbound is one
// malformed candidate, because a label with no well formed identifier behind it
// is exactly an identifier that did not hold its own form.
function readPageRequirements(text) {
  const labels = labelPositions(text);
  const bound = labels.map(() => false);
  const tokens = identifierTokens(text);
  const definitions = [];
  const mentions = [];
  let cursor = -1;
  for (const token of tokens) {
    while (cursor + 1 < labels.length && labels[cursor + 1].end <= token.start) cursor += 1;
    const gap = cursor >= 0 ? token.start - labels[cursor].end : null;
    if (cursor >= 0 && !bound[cursor] && gap <= MAX_LABEL_GAP_CODE_UNITS) {
      bound[cursor] = true;
      definitions.push(token);
      continue;
    }
    mentions.push(token.id);
  }
  const malformed = labels.filter((label, index) => bound[index] === false);
  return {
    definitions,
    mentions,
    // The unbound labels, as spans alone. The count is what `v0` already
    // reported; the spans are what `v0_1` reports beside it, so a malformed
    // candidate can be found on the page without the index quoting one character
    // of it.
    malformed_labels: malformed.map((label) => ({ start: label.start, end: label.end })),
    malformed_candidates: malformed.length,
  };
}

// A bracket title is carried verbatim or not at all. A group past the title
// bound, one carrying a control character, and one that could be a secret are
// each dropped to null rather than repaired or quoted.
function blockTitle(blockText) {
  const match = blockText.match(BRACKET_TITLE);
  return match === null ? null : carriableTitle(match[1]);
}

// The `v0_1` title rule. A title is read only after the fixed requirement label,
// so a bracket that stands in front of it — a unit beside the identifier, a mark
// beside the section — is not a title candidate at all. A candidate that is short
// ascii is a unit or a symbol rather than a title, so it is stepped over and the
// next candidate is read. A candidate that is a title but may not be carried is
// dropped to null exactly as in `v0`: the scan stops there rather than reaching
// past a refused title for another one.
function labelledBlockTitle(blockText) {
  const labelAt = blockText.indexOf(REQUIREMENT_LABEL);
  if (labelAt === -1) return null;
  const tail = blockText.slice(labelAt + REQUIREMENT_LABEL.length);
  for (const match of tail.matchAll(BRACKET_GROUP)) {
    const group = match[1];
    if (group.length <= MAX_UNIT_BRACKET_CHARS && ASCII_GROUP.test(group)) continue;
    return carriableTitle(group);
  }
  return null;
}

// A bracket title is carried verbatim or not at all, on either profile.
function carriableTitle(title) {
  if (title.length === 0 || title.length > MAX_TITLE_CHARS) return null;
  if (!controlFree(title)) return null;
  if (SECRET_LIKE_TITLE.test(title) || CREDENTIAL_HEADER.test(title)
      || LONG_OPAQUE_RUN.test(title)) return null;
  return title;
}

// The identifier family, so rows can be rolled up by the series they belong to.
// An identifier that carries no trailing ordinal is its own family.
function identifierFamily(id) {
  return id.replace(IDENTIFIER_ORDINAL_SUFFIX, "");
}

function controlFree(value) {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < FIRST_PRINTABLE || code === DELETE_CHARACTER) return false;
  }
  return true;
}

// One row per definition. The block runs from the identifier to the next
// identifier on the same page, or to the end of that page, and the block text
// itself never leaves this function: only its length and its digest do. `v0_1`
// reads the title after the requirement label and carries the identifier family
// beside the identifier; every other field is the field `v0` already reported.
function buildRow(pageNumber, blockText, start, end, section, id, extended) {
  const row = { requirement_id: id };
  if (extended) row.id_family = identifierFamily(id);
  row.section = section;
  row.title = extended ? labelledBlockTitle(blockText) : blockTitle(blockText);
  row.page_number = pageNumber;
  row.span = { start, end };
  row.tbc = blockText.includes(TBC_MARK);
  row.tbd = blockText.includes(TBD_MARK);
  row.block_char_count = blockText.length;
  row.block_text_sha256 = `sha256:${digestHex(blockText)}`;
  return row;
}

// Ascii only by the identifier pattern, so utf-16 order is code point order and
// this comparison is the canonical one for these ids.
function compareIds(left, right) {
  if (left < right) return -1;
  return left > right ? 1 : 0;
}

// The whole document, page by page in page order. A page that carries no text is
// skipped rather than searched, and the fixed row and mention bounds refuse the
// index instead of truncating it.
function readRequirementIndex(admitted, extended) {
  const rows = [];
  const definedIds = new Set();
  const duplicateIds = new Set();
  const mentionIds = new Set();
  // Which pages each unlabelled occurrence was seen on, and where each unbound
  // label sat. Both are page numbers and spans alone, so neither carries one
  // character of the page they were recognised in.
  const mentionPages = new Map();
  const malformedLabels = [];
  let malformedCandidates = 0;

  for (const page of admitted.extraction.pages) {
    if (page.text.length === 0) continue;
    const parsed = readPageRequirements(page.text);
    malformedCandidates += parsed.malformed_candidates;
    for (const id of parsed.mentions) {
      mentionIds.add(id);
      if (!mentionPages.has(id)) mentionPages.set(id, new Set());
      mentionPages.get(id).add(page.page_number);
    }
    for (const label of parsed.malformed_labels) {
      if (malformedLabels.length >= MAX_ROWS) return null;
      malformedLabels.push({
        page_number: page.page_number,
        span: { start: label.start, end: label.end },
      });
    }
    if (parsed.definitions.length === 0) continue;
    const marks = sectionMarks(page.text);
    for (let index = 0; index < parsed.definitions.length; index += 1) {
      if (rows.length >= MAX_ROWS) return null;
      const token = parsed.definitions[index];
      const next = parsed.definitions[index + 1];
      const end = next === undefined ? page.text.length : next.start;
      const blockText = page.text.slice(token.start, end);
      if (definedIds.has(token.id)) duplicateIds.add(token.id);
      definedIds.add(token.id);
      rows.push(buildRow(
        page.page_number, blockText, token.start, end, sectionAt(marks, token.start), token.id,
        extended,
      ));
    }
  }

  const mentionOnlyIds = [...mentionIds].filter((id) => !definedIds.has(id)).sort(compareIds);
  if (mentionOnlyIds.length > MAX_MENTION_ONLY_IDS) return null;
  if (mentionPages.size > MAX_MENTION_ONLY_IDS) return null;
  rows.sort((left, right) => (
    left.page_number - right.page_number || left.span.start - right.span.start
  ));
  const sortedIds = [...definedIds].sort(compareIds);
  return {
    rows,
    duplicate_ids: [...duplicateIds].sort(compareIds),
    mention_only_ids: mentionOnlyIds,
    mentions_by_id: mentionsById(mentionPages),
    malformed_labels: malformedLabels,
    ids_sha256: domainFingerprint(IDS_FINGERPRINT_DOMAIN, sortedIds.join("\n")),
    malformed_candidates: malformedCandidates,
  };
}

// The mention roll-up, in identifier order with each page list sorted and
// deduplicated, so the same document always yields the same object.
function mentionsById(mentionPages) {
  const byId = {};
  for (const id of [...mentionPages.keys()].sort(compareIds)) {
    byId[id] = [...mentionPages.get(id)].sort((left, right) => left - right);
  }
  return byId;
}

// ---------------------------------------------------------------- fingerprints

function digestHex(text) {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

// The hash domain, a NUL separator, then the material. Two different subjects
// never share a domain, so one fingerprint can never stand in for another.
function domainFingerprint(domain, text) {
  return `sha256:${digestHex(`${domain}\0${text}`)}`;
}

// ---------------------------------------------------------------- evidence

// What one execution actually verified. Every field is a boolean, a count, a
// fixed enum, a domain separated fingerprint or a digest, and each is filled only
// after the step it reports has completed, so a refused run carries only the
// evidence it reached and `null` where it reached nothing.
function freshEvidence() {
  return {
    profile_id: null,
    admission: {
      knowledge_view_verified: false,
      knowledge_view_project_read_allowed: false,
      document_read_grant_binding_verified: false,
      project_binding_verified: false,
      local_admission_verified: false,
      portable_material_fingerprint_sha256: null,
      relative_locator_fingerprint_sha256: null,
    },
    document: {
      pin_verified: false,
      sha256: null,
      byte_count: null,
      page_count: null,
      character_count: null,
      text_sha256: null,
    },
    counts: {
      rows: null,
      pages_with_rows: null,
      tbc: null,
      tbd: null,
      duplicate_ids: null,
      mention_only: null,
      malformed_candidates: null,
    },
    ids_sha256: null,
    reads: { launch_files: null, project_documents: null },
  };
}

// An admitted candidate is the admission seam's own statement that the view, the
// project binding, the local admission and the read grant binding all held, and
// that exactly one launch file and one project document were read to reach it.
function recordAdmission(evidence, admitted) {
  evidence.admission.knowledge_view_verified = true;
  evidence.admission.knowledge_view_project_read_allowed =
    admitted.admission.knowledge_view_project_read_allowed;
  evidence.admission.document_read_grant_binding_verified =
    admitted.admission.document_read_grant_binding_verified;
  evidence.admission.project_binding_verified = true;
  evidence.admission.local_admission_verified = true;
  evidence.admission.portable_material_fingerprint_sha256 =
    admitted.admission.portable_material_fingerprint_sha256;
  evidence.admission.relative_locator_fingerprint_sha256 =
    admitted.admission.relative_locator_fingerprint_sha256;
  evidence.document.pin_verified = true;
  evidence.document.sha256 = `sha256:${admitted.source.sha256}`;
  evidence.document.byte_count = admitted.source.byte_count;
  evidence.document.page_count = admitted.extraction.page_count;
  evidence.document.character_count = admitted.extraction.character_count;
  evidence.document.text_sha256 = `sha256:${admitted.extraction.text_sha256}`;
  evidence.reads.launch_files = 1;
  evidence.reads.project_documents = 1;
}

function recordIndex(evidence, indexed) {
  const pages = new Set(indexed.rows.map((row) => row.page_number));
  evidence.counts.rows = indexed.rows.length;
  evidence.counts.pages_with_rows = pages.size;
  evidence.counts.tbc = indexed.rows.filter((row) => row.tbc === true).length;
  evidence.counts.tbd = indexed.rows.filter((row) => row.tbd === true).length;
  evidence.counts.duplicate_ids = indexed.duplicate_ids.length;
  evidence.counts.mention_only = indexed.mention_only_ids.length;
  evidence.counts.malformed_candidates = indexed.malformed_candidates;
  evidence.ids_sha256 = indexed.ids_sha256;
}

// The receipt is payload free: every value is a boolean, a count, a fixed enum,
// a domain separated fingerprint or a digest, so no path, locator, project ref,
// page text, identifier, section or title can ride out on it.
function buildReceipt(evidence, blockerKey) {
  const refused = blockerKey !== null;
  return {
    schema_version: PROJECT_PDF_REQUIREMENT_INDEX_RECEIPT_SCHEMA_VERSION,
    kind: "project_pdf_requirement_index_receipt",
    mode: RECEIPT_MODE,
    feature_state: FEATURE_STATE,
    result: refused ? "HOLD" : "PASS",
    blocker_code: refused ? BLOCKERS[blockerKey].code : null,
    blocker_stage: refused ? BLOCKERS[blockerKey].stage : null,
    profile_id: evidence.profile_id,
    admission: {
      knowledge_view_verified: evidence.admission.knowledge_view_verified,
      knowledge_view_project_read_allowed:
        evidence.admission.knowledge_view_project_read_allowed,
      document_read_grant_binding_verified:
        evidence.admission.document_read_grant_binding_verified,
      project_binding_verified: evidence.admission.project_binding_verified,
      local_admission_verified: evidence.admission.local_admission_verified,
      portable_material_fingerprint_sha256:
        evidence.admission.portable_material_fingerprint_sha256,
      relative_locator_fingerprint_sha256:
        evidence.admission.relative_locator_fingerprint_sha256,
    },
    document: {
      pin_verified: evidence.document.pin_verified,
      sha256: evidence.document.sha256,
      byte_count: evidence.document.byte_count,
      page_count: evidence.document.page_count,
      character_count: evidence.document.character_count,
      text_sha256: evidence.document.text_sha256,
    },
    counts: {
      rows: evidence.counts.rows,
      pages_with_rows: evidence.counts.pages_with_rows,
      tbc: evidence.counts.tbc,
      tbd: evidence.counts.tbd,
      duplicate_ids: evidence.counts.duplicate_ids,
      mention_only: evidence.counts.mention_only,
      malformed_candidates: evidence.counts.malformed_candidates,
    },
    ids_sha256: evidence.ids_sha256,
    reads: {
      launch_files: evidence.reads.launch_files,
      project_documents: evidence.reads.project_documents,
    },
    persistence: { state: "not_requested", persistent_file_writes: 0 },
    effects: {
      filesystem_writes: 0,
      network_calls: 0,
      model_calls: 0,
      rag_index_writes: 0,
      wiki_writes: 0,
      engine_calls: 0,
      erp_writes: 0,
      taskdriver_activated: false,
    },
    gates: {
      source_truth_accepted: false,
      canon_accepted: false,
      project_state_accepted: false,
      accepted_context_granted: false,
      operational_retrieval_allowed: false,
      owner_decision_made: false,
      activation_allowed: false,
    },
    canon_claim_ceiling: CANON_CLAIM_CEILING,
  };
}

// A refusal has no index at all. A partial index would still be an index, so the
// index stays null and only the payload free receipt is returned.
function hold(blockerKey, evidence) {
  return deepFreeze({ index: null, receipt: buildReceipt(evidence, blockerKey) });
}

function deepFreeze(value) {
  if (value === null || typeof value !== "object") return value;
  for (const key of Object.keys(value)) deepFreeze(value[key]);
  return Object.freeze(value);
}

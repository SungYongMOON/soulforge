// The consolidated characterisation of the project pdf requirement index seam.
// One pinned launch names one admitted pdf, one fixed profile decides what a
// requirement identifier block is, and the seam either returns one closed, deep
// frozen index or fails closed with an index of null and a payload free receipt.
// Stated here: the happy path over a document that carries a `TBC` block, a
// `TBD` duplicate, an unlabelled mention and a label with no well formed
// identifier behind it; a document that declares no requirement at all;
// deterministic replay; request refusal settled before admission opens a file;
// admission refusal; a bracket title that could be a secret; and the read only
// shape of the source itself.
//
// Everything here is public and synthetic: pdfs this file writes into a
// temporary runtime that is removed in `finally`, and no private source,
// workspace payload, network, model, mock, command line or persistence anywhere.
// The korean page text is produced through the real extractor: the file bytes
// stay ascii and one `ToUnicode` map is what makes the written codes extract as
// the korean the profile recognises. The admission seam is deliberately not
// imported and not invoked here: this test states what the one index call must
// return, not how it composes it. The only file it reads besides its own
// temporary fixture is the index source, as text, to pin the surfaces that
// source may not have.
import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import { canonicalise } from "../engineering_engine/kernel/canonical.mjs";
import { sha256Hex } from "../engineering_engine/kernel/fingerprint.mjs";
import {
  PROJECT_KNOWLEDGE_VIEW_AUTHORITY_GRANT_HASH_DOMAIN,
  PROJECT_KNOWLEDGE_VIEW_AUTHORITY_GRANT_SCHEMA_VERSION,
  PROJECT_KNOWLEDGE_VIEW_REQUEST_SCHEMA_VERSION,
  selectProjectKnowledgeView,
} from "../shared/project_knowledge_view.mjs";

import {
  PROJECT_PDF_REQUIREMENT_INDEX_RECEIPT_SCHEMA_VERSION,
  PROJECT_PDF_REQUIREMENT_INDEX_SCHEMA_VERSION,
  REQUIREMENT_INDEX_PROFILES,
  buildProjectPdfRequirementIndex,
} from "./project_pdf_requirement_index.mjs";

// The same public synthetic one-page PDF the ingest, admission and tracer seams
// are pinned against. It declares no requirement identifier at all, so it is
// also this seam's empty document. No project payload, no private source.
const PLAIN_BASE64 =
  "JVBERi0xLjcKJcK1wrYKJSBXcml0dGVuIGJ5IE11UERGIDEuMjcuMgoKMSAwIG9iago8PC9UeXBlL0NhdGFsb2cvUGFnZXMgMiAwIFIvSW5mbzw8L1Byb2R1Y2VyKE11UERGIDEuMjcuMik+Pj4+CmVuZG9iagoKMiAwIG9iago8PC9UeXBlL1BhZ2VzL0NvdW50IDEvS2lkc1s0IDAgUl0+PgplbmRvYmoKCjMgMCBvYmoKPDwvRm9udDw8L2hlbHYgNSAwIFI+Pj4+CmVuZG9iagoKNCAwIG9iago8PC9UeXBlL1BhZ2UvTWVkaWFCb3hbMCAwIDMwMCAyMDBdL1JvdGF0ZSAwL1Jlc291cmNlcyAzIDAgUi9QYXJlbnQgMiAwIFIvQ29udGVudHNbNiAwIFJdPj4KZW5kb2JqCgo1IDAgb2JqCjw8L1R5cGUvRm9udC9TdWJ0eXBlL1R5cGUxL0Jhc2VGb250L0hlbHZldGljYS9FbmNvZGluZy9XaW5BbnNpRW5jb2Rpbmc+PgplbmRvYmoKCjYgMCBvYmoKPDwvTGVuZ3RoIDk5L0ZpbHRlci9GbGF0ZURlY29kZT4+CnN0cmVhbQp42h2KMQrDQAwEe71CP7Ckk/ZcBBeBNOkC6oKrw4cLu0jj9+cwWwwzLP3omaQsY8oFrDZznjTt23GxKmfn7yMKeg00YNBQESYh7g6T6qMoCqKaCez+tWG+rPmmV9KH/oHxFqwKZW5kc3RyZWFtCmVuZG9iagoKeHJlZgowIDcKMDAwMDAwMDAwMCA2NTUzNSBmIAowMDAwMDAwMDQyIDAwMDAwIG4gCjAwMDAwMDAxMjAgMDAwMDAgbiAKMDAwMDAwMDE3MiAwMDAwMCBuIAowMDAwMDAwMjEzIDAwMDAwIG4gCjAwMDAwMDAzMjAgMDAwMDAgbiAKMDAwMDAwMDQwOSAwMDAwMCBuIAoKdHJhaWxlcgo8PC9TaXplIDcvUm9vdCAxIDAgUi9JRFs8MTdDM0FDQzI5MDY4QzI5MjU2QzM4NzdFMTRDMzhGQzM+PDhEOENBRUNDNzNGREU3MkRGNDc5NzBGQzM0NUQ3ODNFPl0+PgpzdGFydHhyZWYKNTc2CiUlRU9GCg==";
const PLAIN_TEXT = "Soulforge PDF tracer bullet\n";

// Restated rather than imported: the index must keep this launch contract even
// if the admission seam renames one of its own constants.
const LAUNCH_SCHEMA_VERSION = "soulforge.project_pdf_admission_launch.v0";
const READ_GRANT_SCHEMA_VERSION = "soulforge.project_pdf_read_grant.v0";
const READ_GRANT_HASH_DOMAIN = "soulforge.project_pdf_admission.document_read_grant.v0";
const PORTABLE_MATERIAL_HASH_DOMAIN = "soulforge.project_pdf_admission.portable_material.v0";
const RELATIVE_LOCATOR_HASH_DOMAIN = "soulforge.project_pdf_admission.relative_locator.v0";
const READ_GRANT_AUTHORITY_CEILING = "single_pdf_candidate_extraction_only";
const MEDIA_TYPE = "application/pdf";
const RELATIVE_LOCATOR = "documents/spec.pdf";

// The one profile this seam implements, and the domain its identifier roll-up is
// computed under. Both are restated so a renamed constant cannot pass silently.
const PROFILE_ID = "kr_defense_spec_v0";
const IDS_FINGERPRINT_DOMAIN = "soulforge.project_pdf_requirement_index.ids.v0";

// The seam's own fixed bounds. Nothing in the request names them, so they exist
// here only as the expectation the returned indexes and receipts must meet.
const MAX_ROWS = 5000;
const MAX_TITLE_CHARS = 120;
const MAX_LABEL_GAP_CODE_UNITS = 64;

function exactRef(seed) {
  const token = String(seed).padStart(12, "0");
  return {
    entity_id: `00000000-0000-4000-8000-${token}`,
    revision_id: `10000000-0000-4000-8000-${token}`,
    content_id: `sha256:${String(seed).padStart(64, "0")}`,
    content_hash_alg: "sha256",
  };
}

function insertionOrderRules(value) {
  const rules = {};
  const visit = (node, path = "") => {
    if (Array.isArray(node)) {
      rules[path] = "insertion_ordered";
      node.forEach((child) => visit(child, `${path}[]`));
    } else if (node !== null && typeof node === "object") {
      Object.entries(node).forEach(([key, child]) => visit(child, path ? `${path}.${key}` : key));
    }
  };
  visit(value);
  return rules;
}

// Same shape as the canonical fingerprint the Knowledge View computes: the hash
// domain, a NUL separator, then the canonical serialisation of the material.
function canonicalFingerprint(domain, material) {
  const canonical = canonicalise(material, insertionOrderRules(material));
  return `sha256:${sha256Hex(`${domain}\0${canonical}`)}`;
}

const canonicalBytes = (value) => Buffer.from(
  `${canonicalise(value, insertionOrderRules(value))}\n`,
  "utf8",
);

function bindAuthorityGrant(grantDraft) {
  return {
    ...grantDraft,
    grant_ref: {
      ...grantDraft.grant_ref,
      content_id: canonicalFingerprint(PROJECT_KNOWLEDGE_VIEW_AUTHORITY_GRANT_HASH_DOMAIN, {
        schema_version: grantDraft.schema_version,
        feature_state: grantDraft.feature_state,
        authority_ceiling: grantDraft.authority_ceiling,
        policy_ref: grantDraft.policy_ref,
        project_binding_ref: grantDraft.project_binding_ref,
        project_root_path: grantDraft.project_root_path,
        common_root_path: grantDraft.common_root_path,
        containment_root_path: grantDraft.containment_root_path,
        approved_common_revision_refs: grantDraft.approved_common_revision_refs,
      }),
    },
  };
}

// The read grant ref is the canonical hash of every other grant field, so no
// single field can be swapped without invalidating the grant.
function bindDocumentReadGrant(grantDraft) {
  return {
    ...grantDraft,
    grant_ref: {
      ...grantDraft.grant_ref,
      content_id: canonicalFingerprint(READ_GRANT_HASH_DOMAIN, {
        schema_version: grantDraft.schema_version,
        feature_state: grantDraft.feature_state,
        authority_ceiling: grantDraft.authority_ceiling,
        read_policy_ref: grantDraft.read_policy_ref,
        project_binding_ref: grantDraft.project_binding_ref,
        knowledge_scope_fingerprint_sha256: grantDraft.knowledge_scope_fingerprint_sha256,
        local_admission_fingerprint_sha256: grantDraft.local_admission_fingerprint_sha256,
        relative_locator: grantDraft.relative_locator,
        document_revision_ref: grantDraft.document_revision_ref,
        media_type: grantDraft.media_type,
      }),
    },
  };
}

// Portable: it carries the path-independent scope commitment and no local
// admission observation, so it survives a move to another machine.
function portableMaterialFingerprint(readGrant) {
  return canonicalFingerprint(PORTABLE_MATERIAL_HASH_DOMAIN, {
    project_binding_ref: readGrant.project_binding_ref,
    knowledge_scope_fingerprint_sha256: readGrant.knowledge_scope_fingerprint_sha256,
    read_policy_ref: readGrant.read_policy_ref,
    relative_locator: readGrant.relative_locator,
    document_revision_ref: readGrant.document_revision_ref,
    media_type: readGrant.media_type,
  });
}

function relativeLocatorFingerprint(readGrant) {
  return canonicalFingerprint(RELATIVE_LOCATOR_HASH_DOMAIN, {
    project_binding_ref: readGrant.project_binding_ref,
    relative_locator: readGrant.relative_locator,
    document_revision_ref: readGrant.document_revision_ref,
  });
}

// The real admission fixture, reduced to the one shape this seam needs: a
// temporary runtime, one pinned launch, one bound read grant and one pinned pdf
// under the admitted project root. Options only reshape the synthetic fixture —
// other document bytes, another locator, another temporary or launch name — and
// every variant is rebuilt from those values, so each one stays validly bound and
// repinned. `cleanup` removes the whole temporary tree, so nothing this test
// writes outlives it.
function admissionFixture(options = {}) {
  const tempRoot = mkdtempSync(join(tmpdir(), options.tempPrefix ?? "soulforge-pdf-req-index-"));
  const containmentRoot = join(tempRoot, "workspace");
  const projectRoot = join(containmentRoot, "project");
  const commonRoot = join(containmentRoot, "common");
  mkdirSync(projectRoot, { recursive: true });
  mkdirSync(commonRoot, { recursive: true });

  const projectRef = exactRef(1);
  const request = {
    schema_version: PROJECT_KNOWLEDGE_VIEW_REQUEST_SCHEMA_VERSION,
    feature_state: "off",
    project_binding_refs: [projectRef],
    common_revision_refs: [],
  };
  const authorityGrant = bindAuthorityGrant({
    schema_version: PROJECT_KNOWLEDGE_VIEW_AUTHORITY_GRANT_SCHEMA_VERSION,
    feature_state: "off",
    authority_ceiling: "synthetic_validation_only",
    grant_ref: exactRef(2),
    policy_ref: exactRef(3),
    project_binding_ref: projectRef,
    project_root_path: projectRoot,
    common_root_path: commonRoot,
    containment_root_path: containmentRoot,
    approved_common_revision_refs: [],
  });

  // The view is consulted here only to obtain the two fingerprints the read
  // grant must commit to. The seam under test performs its own admission.
  const view = selectProjectKnowledgeView(request, authorityGrant, authorityGrant.grant_ref);

  const documentBytes = options.documentBytes ?? Buffer.from(PLAIN_BASE64, "base64");
  const documentSha256 = sha256Hex(documentBytes);
  const locator = options.relativeLocator ?? RELATIVE_LOCATOR;
  const documentPath = join(projectRoot, ...locator.split("/"));
  mkdirSync(dirname(documentPath), { recursive: true });
  writeFileSync(documentPath, documentBytes);

  const readGrant = bindDocumentReadGrant({
    schema_version: READ_GRANT_SCHEMA_VERSION,
    feature_state: "off",
    authority_ceiling: READ_GRANT_AUTHORITY_CEILING,
    grant_ref: exactRef(11),
    read_policy_ref: exactRef(12),
    project_binding_ref: projectRef,
    knowledge_scope_fingerprint_sha256: view.knowledge_scope_fingerprint_sha256,
    local_admission_fingerprint_sha256: view.local_admission_fingerprint_sha256,
    relative_locator: locator,
    // Nothing else in the grant carries the document digest, so the exact
    // revision content id is the pin the opened bytes must satisfy.
    document_revision_ref: {
      ...exactRef(13),
      content_id: `sha256:${documentSha256}`,
    },
    media_type: MEDIA_TYPE,
  });

  const launch = {
    schema_version: LAUNCH_SCHEMA_VERSION,
    feature_state: "off",
    project_knowledge_view_request: request,
    project_knowledge_view_authority_grant: authorityGrant,
    expected_project_knowledge_view_authority_grant_ref:
      structuredClone(authorityGrant.grant_ref),
    document_read_grant: readGrant,
    expected_document_read_grant_ref: structuredClone(readGrant.grant_ref),
  };
  const launchBytes = canonicalBytes(launch);
  const launchPath = join(tempRoot, options.launchFileName ?? "launch.json");
  writeFileSync(launchPath, launchBytes);

  return {
    documentBytes,
    documentSha256,
    tempRoot,
    projectRoot,
    documentPath,
    locator,
    projectRef,
    readGrant,
    view,
    launchPath,
    expectedLaunchSha256: sha256Hex(launchBytes),
    cleanup: () => rmSync(tempRoot, { recursive: true, force: true }),
  };
}

// ---------------------------------------------------------------- synthetic pdf

// A deterministic, public, ascii only pdf writer. Every korean character the
// fixture uses is written as one high byte code through an octal escape, and one
// `ToUnicode` map is what makes those codes extract as the korean the profile
// recognises. The map is derived from the fixture's own characters in code point
// order, so the same input always yields the same bytes, and no letter, digit or
// punctuation is remapped: an identifier, a section number and a bracket stay
// exactly what they were written as.
const PDF_FONT_SIZE = 8;
const PDF_LEADING = 12;
const PDF_LEFT_MARGIN = 36;
const FIRST_MAPPED_CODE = 0xa1;
const LAST_MAPPED_CODE = 0xff;

function mappedCodes(pages) {
  const characters = [...new Set(pages.flatMap((page) => page.lines).join(""))]
    .filter((character) => character.codePointAt(0) > 0x7f)
    .sort();
  assert.equal(
    characters.length <= LAST_MAPPED_CODE - FIRST_MAPPED_CODE + 1, true,
    "the synthetic fixture must stay inside one byte of mapped characters",
  );
  return new Map(characters.map((character, index) => [character, FIRST_MAPPED_CODE + index]));
}

function toUnicodeStream(codes) {
  const pairs = [...codes].map(([character, code]) => (
    `<${code.toString(16).padStart(2, "0").toUpperCase()}> `
    + `<${character.codePointAt(0).toString(16).padStart(4, "0").toUpperCase()}>`
  )).join("\n");
  return `/CIDInit /ProcSet findresource begin
12 dict begin
begincmap
/CMapName /SoulforgeSynthetic def
/CMapType 2 def
1 begincodespacerange
<00> <FF>
endcodespacerange
${codes.size} beginbfchar
${pairs}
endbfchar
endcmap
CMapName currentdict /CMap defineresource pop
end
end
`;
}

function pdfLiteral(line, codes) {
  let literal = "";
  for (const character of line) {
    const code = codes.get(character);
    if (code !== undefined) {
      literal += `\\${code.toString(8).padStart(3, "0")}`;
      continue;
    }
    literal += "()\\".includes(character) ? `\\${character}` : character;
  }
  return literal;
}

function pdfContentStream(lines, height, codes) {
  if (lines.length === 0) return "";
  const head = `BT\n/F1 ${PDF_FONT_SIZE} Tf\n${PDF_LEADING} TL\n`
    + `${PDF_LEFT_MARGIN} ${height - PDF_LEADING * 2} Td\n`;
  return `${head}${lines.map((line) => `(${pdfLiteral(line, codes)}) Tj\nT*\n`).join("")}ET\n`;
}

function syntheticPdf(pages) {
  const codes = mappedCodes(pages);
  const toUnicode = toUnicodeStream(codes);
  const objects = [
    "<</Type/Catalog/Pages 2 0 R>>",
    `<</Type/Pages/Count ${pages.length}/Kids[${
      pages.map((page, index) => `${5 + index * 2} 0 R`).join(" ")}]>>`,
    "<</Type/Font/Subtype/Type1/BaseFont/Helvetica/Encoding/WinAnsiEncoding/ToUnicode 4 0 R>>",
    `<</Length ${toUnicode.length}>>\nstream\n${toUnicode}endstream`,
  ];
  pages.forEach((page, index) => {
    objects.push(
      `<</Type/Page/MediaBox[0 0 ${page.width} ${page.height}]/Rotate 0`
      + `/Resources<</Font<</F1 3 0 R>>>>/Parent 2 0 R/Contents ${6 + index * 2} 0 R>>`,
    );
    const stream = pdfContentStream(page.lines, page.height, codes);
    objects.push(`<</Length ${stream.length}>>\nstream\n${stream}endstream`);
  });

  let body = "%PDF-1.7\n";
  const offsets = [];
  objects.forEach((object, index) => {
    offsets.push(body.length);
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = body.length;
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) xref += `${String(offset).padStart(10, "0")} 00000 n \n`;
  const pdf = `${body}${xref}trailer\n<</Size ${objects.length + 1}/Root 1 0 R>>\n`
    + `startxref\n${xrefOffset}\n%%EOF\n`;
  // Ascii only, so one code unit is one byte and every offset written above is
  // the byte offset it claims to be.
  assert.equal(Buffer.byteLength(pdf, "utf8"), pdf.length, "the synthetic pdf must stay ascii");
  return Buffer.from(pdf, "ascii");
}

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 400;
const pageOf = (lines) => ({ width: PAGE_WIDTH, height: PAGE_HEIGHT, lines });
// The extractor reports one page as its lines joined by a newline, with a
// trailing newline. Every span below is read off these exact strings, and the
// text digest on the receipt is what proves the extractor still laid them out
// this way.
const extractedText = (lines) => `${lines.join("\n")}\n`;

// ---------------------------------------------------------------- the document

// Two pages of requirement blocks in the shape the profile recognises: a section
// number, the fixed label, the identifier it announces, a bracket title, and the
// requirement body under it. Page one carries a `TBC` block and an identifier
// mentioned with no label in front of it; page two redefines page one's
// identifier under a `TBD` mark and ends with a label no well formed identifier
// follows.
const SPEC_PAGE_ONE_LINES = [
  "3.3.3.5. 필터링기능",
  "식별자",
  "R-TB_DIV-SFR-005 (TBC)",
  "요구사양",
  "[필터링기능]",
  "예인몸체는 다음 항목을 요구한다",
  "3.3.3.6. 예인기능",
  "식별자",
  "R_TB_PETB-SRR-001",
  "요구사양",
  "[예인기능]",
  "관련 항목 R-TB_DIV-SRR-009 참조",
];
const SPEC_PAGE_TWO_LINES = [
  "4.1.2. 중복항목",
  "식별자",
  "R-TB_DIV-SFR-005 (TBD)",
  "요구사양",
  "[중복항목]",
  "같은 항목을 다시 정의한다",
  "4.1.3. 미정항목",
  "식별자",
  "미정",
  "요구사양",
  "[미정항목]",
];
const SPEC_PAGE_ONE_TEXT = extractedText(SPEC_PAGE_ONE_LINES);
const SPEC_PAGE_TWO_TEXT = extractedText(SPEC_PAGE_TWO_LINES);
const SPEC_PAGES = [SPEC_PAGE_ONE_TEXT, SPEC_PAGE_TWO_TEXT];
const specPdf = () => syntheticPdf([pageOf(SPEC_PAGE_ONE_LINES), pageOf(SPEC_PAGE_TWO_LINES)]);

const FILTER_ID = "R-TB_DIV-SFR-005";
const TOW_ID = "R_TB_PETB-SRR-001";
const MENTION_ID = "R-TB_DIV-SRR-009";

// The spans, read off the page text rather than predicted: a block runs from its
// identifier to the next identifier on the same page, or to the end of it.
const FILTER_START = SPEC_PAGE_ONE_TEXT.indexOf(FILTER_ID);
const TOW_START = SPEC_PAGE_ONE_TEXT.indexOf(TOW_ID);
const DUPLICATE_START = SPEC_PAGE_TWO_TEXT.indexOf(FILTER_ID);

function expectedRow({ id, section, title, page, start, end, text, tbc = false, tbd = false }) {
  const block = text.slice(start, end);
  return {
    requirement_id: id,
    section,
    title,
    page_number: page,
    span: { start, end },
    tbc,
    tbd,
    block_char_count: block.length,
    block_text_sha256: `sha256:${sha256Hex(block)}`,
  };
}

const FILTER_ROW = expectedRow({
  id: FILTER_ID,
  section: "3.3.3.5.",
  title: "필터링기능",
  page: 1,
  start: FILTER_START,
  end: TOW_START,
  text: SPEC_PAGE_ONE_TEXT,
  tbc: true,
});
const TOW_ROW = expectedRow({
  id: TOW_ID,
  section: "3.3.3.6.",
  title: "예인기능",
  page: 1,
  start: TOW_START,
  end: SPEC_PAGE_ONE_TEXT.length,
  text: SPEC_PAGE_ONE_TEXT,
});
const DUPLICATE_ROW = expectedRow({
  id: FILTER_ID,
  section: "4.1.2.",
  title: "중복항목",
  page: 2,
  start: DUPLICATE_START,
  end: SPEC_PAGE_TWO_TEXT.length,
  text: SPEC_PAGE_TWO_TEXT,
  tbd: true,
});

// The identifier roll-up: the sorted, deduplicated defined identifiers under this
// seam's own hash domain. The identifiers themselves never reach the receipt.
function idsFingerprint(ids) {
  return `sha256:${sha256Hex(`${IDS_FINGERPRINT_DOMAIN}\0${ids.join("\n")}`)}`;
}

const ZERO_COUNTS = Object.freeze({
  rows: 0,
  pages_with_rows: 0,
  tbc: 0,
  tbd: 0,
  duplicate_ids: 0,
  mention_only: 0,
  malformed_candidates: 0,
});
const SPEC_COUNTS = Object.freeze({
  rows: 3,
  pages_with_rows: 2,
  tbc: 1,
  tbd: 1,
  duplicate_ids: 1,
  mention_only: 1,
  malformed_candidates: 1,
});

// ---------------------------------------------------------------- expectations

function documentEvidence(state, pages) {
  const text = pages.join("");
  return {
    pin_verified: true,
    sha256: `sha256:${state.documentSha256}`,
    byte_count: state.documentBytes.byteLength,
    page_count: pages.length,
    character_count: text.length,
    text_sha256: `sha256:${sha256Hex(text)}`,
  };
}

function expectedIndex(state, pages, {
  rows = [],
  duplicateIds = [],
  mentionOnlyIds = [],
} = {}) {
  const document = documentEvidence(state, pages);
  return {
    schema_version: PROJECT_PDF_REQUIREMENT_INDEX_SCHEMA_VERSION,
    profile_id: PROFILE_ID,
    document: {
      sha256: document.sha256,
      page_count: document.page_count,
      character_count: document.character_count,
      text_sha256: document.text_sha256,
    },
    rows,
    duplicate_ids: duplicateIds,
    mention_only_ids: mentionOnlyIds,
    row_count: rows.length,
  };
}

// The evidence a run that never reached a step may not carry. Every field is the
// null or the false the receipt must report where it verified nothing, so a
// refused run can never read back as a run that got further than it did.
const NO_ADMISSION_EVIDENCE = Object.freeze({
  knowledge_view_verified: false,
  knowledge_view_project_read_allowed: false,
  document_read_grant_binding_verified: false,
  project_binding_verified: false,
  local_admission_verified: false,
  portable_material_fingerprint_sha256: null,
  relative_locator_fingerprint_sha256: null,
});
const NO_DOCUMENT_EVIDENCE = Object.freeze({
  pin_verified: false,
  sha256: null,
  byte_count: null,
  page_count: null,
  character_count: null,
  text_sha256: null,
});
const NO_COUNTS = Object.freeze({
  rows: null,
  pages_with_rows: null,
  tbc: null,
  tbd: null,
  duplicate_ids: null,
  mention_only: null,
  malformed_candidates: null,
});
const NO_READS = Object.freeze({ launch_files: null, project_documents: null });

// The admission seam's own statement, as the receipt must report it: the view,
// the project binding, the local admission and the read grant binding all held.
function admissionEvidence(state) {
  return {
    knowledge_view_verified: true,
    knowledge_view_project_read_allowed: false,
    document_read_grant_binding_verified: true,
    project_binding_verified: true,
    local_admission_verified: true,
    portable_material_fingerprint_sha256: portableMaterialFingerprint(state.readGrant),
    relative_locator_fingerprint_sha256: relativeLocatorFingerprint(state.readGrant),
  };
}

// The receipt is payload free: every value is a boolean, a count, a fixed enum,
// a domain separated fingerprint or a digest, so no path, locator, project ref,
// page text, identifier, section or title can ride out on it.
function expectedReceipt(state, {
  result = "PASS",
  blockerCode = null,
  blockerStage = null,
  profileId = PROFILE_ID,
  admission = admissionEvidence(state),
  document = NO_DOCUMENT_EVIDENCE,
  counts = NO_COUNTS,
  idsSha256 = null,
  reads = { launch_files: 1, project_documents: 1 },
} = {}) {
  return {
    schema_version: PROJECT_PDF_REQUIREMENT_INDEX_RECEIPT_SCHEMA_VERSION,
    kind: "project_pdf_requirement_index_receipt",
    mode: "read_only",
    feature_state: "off",
    result,
    blocker_code: blockerCode,
    blocker_stage: blockerStage,
    profile_id: profileId,
    admission: { ...admission },
    document: { ...document },
    counts: { ...counts },
    ids_sha256: idsSha256,
    reads: { ...reads },
    persistence: {
      state: "not_requested",
      persistent_file_writes: 0,
    },
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
    canon_claim_ceiling: "observed",
  };
}

// No key anywhere in a receipt may be one of the raw payload names this seam
// handles: a path, a locator, page text, a title, a section, an identifier, a
// span, a ref field or a raw error, at any depth. Matched exactly rather than by
// substring, because the receipt contract requires
// `relative_locator_fingerprint_sha256`, `ids_sha256` and `counts.duplicate_ids`
// — digests and counts of those things, not the things themselves — and a
// substring rule refuses the very keys the receipt must carry.
const FORBIDDEN_RECEIPT_KEYS = new Set([
  "path", "paths", "launch_path", "launchPath", "document_path", "documentPath",
  "root_path", "project_root_path", "common_root_path", "containment_root_path",
  "real_path", "comparable_real_path", "local_path",
  "locator", "relative_locator", "locator_segments", "segments",
  "body", "bytes", "text", "content", "pages", "page_text", "block_text", "source_text",
  "excerpt", "excerpts", "title", "titles", "section", "sections",
  "requirement_id", "requirement_ids", "identifier", "identifiers", "ids",
  "mention_only_ids", "span", "spans",
  "message", "messages", "stack", "error", "errors", "cause",
  "entity", "entity_id", "revision", "revision_id", "content_id",
  "ref", "refs", "grant_ref", "policy_ref", "read_policy_ref", "authority_grant_ref",
  "project_binding_ref", "document_revision_ref", "document_read_grant_ref",
]);

function assertDeeplyFrozen(value, trail) {
  if (value === null || typeof value !== "object") return;
  assert.equal(Object.isFrozen(value), true, `${trail} must be frozen`);
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertDeeplyFrozen(item, `${trail}[${index}]`));
    return;
  }
  for (const [key, item] of Object.entries(value)) {
    assertDeeplyFrozen(item, `${trail}.${key}`);
  }
}

function assertNoForbiddenKeys(node, trail) {
  if (node === null || typeof node !== "object") return;
  for (const [key, value] of Object.entries(node)) {
    assert.equal(
      FORBIDDEN_RECEIPT_KEYS.has(key), false, `${trail}.${key} must carry no payload`,
    );
    assertNoForbiddenKeys(value, `${trail}.${key}`);
  }
}

// Payload free by key and by content: no page text, no title, no identifier, no
// path and no locator may appear anywhere in a receipt.
function assertPayloadFreeReceipt(receipt, markers) {
  assertNoForbiddenKeys(receipt, "receipt");
  const serialised = JSON.stringify(receipt);
  for (const marker of markers) {
    assert.equal(
      serialised.includes(marker), false, "the receipt must carry no raw payload",
    );
  }
}

// A refusal has no index at all. A partial index would still be an index, so the
// index stays null and only the payload free receipt is returned.
function assertClosedHold(result, expected) {
  assert.equal(result.index, null, "a refusal must carry no index");
  assert.deepEqual(result.receipt, expected);
  assert.equal(Object.isFrozen(result), true, "the returned result must be frozen");
  assertDeeplyFrozen(result.receipt, "project_pdf_requirement_index_receipt");
}

// Every file under the fixture, by relative name and content digest. A read only
// seam may not add, remove, move or rewrite one of them.
function treeSnapshot(root) {
  const entries = [];
  const walk = (directory, trail) => {
    for (const name of readdirSync(directory).sort()) {
      const full = join(directory, name);
      const relative = `${trail}${name}`;
      if (statSync(full).isDirectory()) {
        entries.push([`${relative}/`, "directory"]);
        walk(full, `${relative}/`);
        continue;
      }
      entries.push([relative, sha256Hex(readFileSync(full))]);
    }
  };
  walk(root, "");
  return entries;
}

// ---------------------------------------------------------------- happy path

test("indexes one pinned project pdf into one closed requirement index and receipt", async () => {
  const state = admissionFixture({ documentBytes: specPdf() });
  try {
    const before = treeSnapshot(state.tempRoot);

    // Exactly one index call, and exactly three own fields on the request: the
    // pinned launch, its digest, and the fixed profile. No pattern, gap, cap or
    // title rule is passed, because a caller that could name its own recognition
    // rule could widen what a requirement is allowed to be.
    const request = {
      launchPath: state.launchPath,
      expectedLaunchSha256: state.expectedLaunchSha256,
      profileId: PROFILE_ID,
    };
    assert.deepEqual(Reflect.ownKeys(request), [
      "launchPath",
      "expectedLaunchSha256",
      "profileId",
    ]);

    const { index, receipt } = await buildProjectPdfRequirementIndex(request);

    // The extractor still lays the two pages out exactly as the spans above were
    // read off, so every offset below is the offset it claims to be.
    assert.equal(index.document.text_sha256, `sha256:${sha256Hex(SPEC_PAGES.join(""))}`);

    assert.deepEqual(index, expectedIndex(state, SPEC_PAGES, {
      rows: [FILTER_ROW, TOW_ROW, DUPLICATE_ROW],
      duplicateIds: [FILTER_ID],
      mentionOnlyIds: [MENTION_ID],
    }));
    assert.deepEqual(receipt, expectedReceipt(state, {
      document: documentEvidence(state, SPEC_PAGES),
      counts: SPEC_COUNTS,
      idsSha256: idsFingerprint([FILTER_ID, TOW_ID]),
    }));

    // The rows, stated on their own: the label bound identifier, its section, its
    // bracket title, the page it was recognised on, and the block digest that
    // stands in for the block text the index never carries.
    assert.equal(index.row_count, 3);
    assert.deepEqual(index.rows.map((row) => row.requirement_id), [FILTER_ID, TOW_ID, FILTER_ID]);
    assert.deepEqual(index.rows.map((row) => row.section), ["3.3.3.5.", "3.3.3.6.", "4.1.2."]);
    assert.deepEqual(index.rows.map((row) => row.title), ["필터링기능", "예인기능", "중복항목"]);
    assert.deepEqual(index.rows.map((row) => row.page_number), [1, 1, 2]);
    assert.deepEqual(index.rows.map((row) => row.tbc), [true, false, false]);
    assert.deepEqual(index.rows.map((row) => row.tbd), [false, false, true]);

    // Sorted by page, then by where the block opens inside that page.
    const ordered = index.rows.map((row) => [row.page_number, row.span.start]);
    assert.deepEqual([...ordered].sort((left, right) => (
      left[0] - right[0] || left[1] - right[1]
    )), ordered);

    // A block runs from its identifier to the next identifier on the same page,
    // or to the end of that page, and it never crosses a page.
    assert.equal(index.rows[0].span.end, index.rows[1].span.start);
    assert.equal(index.rows[1].span.end, SPEC_PAGE_ONE_TEXT.length);
    assert.equal(index.rows[2].span.end, SPEC_PAGE_TWO_TEXT.length);
    for (const row of index.rows) {
      const text = row.page_number === 1 ? SPEC_PAGE_ONE_TEXT : SPEC_PAGE_TWO_TEXT;
      assert.equal(row.span.start < row.span.end, true);
      assert.equal(row.span.end <= text.length, true, "a block may not cross a page");
      assert.equal(row.block_char_count, row.span.end - row.span.start);
      assert.equal(
        row.block_text_sha256, `sha256:${sha256Hex(text.slice(row.span.start, row.span.end))}`,
      );
      assert.equal(text.startsWith(row.requirement_id, row.span.start), true,
        "a block must open on the identifier it names");
      assert.equal(row.title.length <= MAX_TITLE_CHARS, true);
    }

    // The same identifier defined twice is one duplicate, and an identifier that
    // only ever appears without a label in front of it is a mention and no row.
    assert.deepEqual(index.duplicate_ids, [FILTER_ID]);
    assert.deepEqual(index.mention_only_ids, [MENTION_ID]);
    assert.equal(
      index.rows.some((row) => row.requirement_id === MENTION_ID), false,
      "an unlabelled mention may not become a row",
    );
    assert.equal(
      SPEC_PAGE_ONE_TEXT.includes(MENTION_ID), true, "the mention must really be on the page",
    );

    // A label with no well formed identifier behind it is counted and nothing
    // else: it mints no row and no identifier.
    assert.equal(receipt.counts.malformed_candidates, 1);
    assert.equal(SPEC_PAGE_TWO_TEXT.includes("식별자\n미정"), true);

    assert.deepEqual(Object.keys(index), [
      "schema_version",
      "profile_id",
      "document",
      "rows",
      "duplicate_ids",
      "mention_only_ids",
      "row_count",
    ]);
    assert.deepEqual(Object.keys(index.rows[0]), [
      "requirement_id",
      "section",
      "title",
      "page_number",
      "span",
      "tbc",
      "tbd",
      "block_char_count",
      "block_text_sha256",
    ]);
    assert.deepEqual(Object.keys(receipt), [
      "schema_version",
      "kind",
      "mode",
      "feature_state",
      "result",
      "blocker_code",
      "blocker_stage",
      "profile_id",
      "admission",
      "document",
      "counts",
      "ids_sha256",
      "reads",
      "persistence",
      "effects",
      "gates",
      "canon_claim_ceiling",
    ]);

    // Every gate is false and every effect is zero: this seam searched nothing,
    // wrote nothing and started nothing.
    assert.deepEqual(Object.values(receipt.gates).filter((passed) => passed !== false), []);
    assert.deepEqual(
      Object.entries(receipt.effects).filter(([, value]) => value !== 0 && value !== false), [],
    );
    assert.deepEqual(receipt.reads, { launch_files: 1, project_documents: 1 });
    assert.equal(receipt.canon_claim_ceiling, "observed");

    // Payload free, by key and by content: only counts, digests, false gates and
    // zero effects. The index may carry the title it recognised; a receipt may
    // carry nothing at all.
    assertPayloadFreeReceipt(receipt, [
      FILTER_ID, TOW_ID, MENTION_ID, "필터링기능", "예인기능", "중복항목", "식별자",
      "3.3.3.5.", SPEC_PAGE_ONE_TEXT.trim(), RELATIVE_LOCATOR,
      state.launchPath, state.tempRoot, state.projectRoot,
      state.projectRef.entity_id,
      state.readGrant.grant_ref.entity_id,
      state.readGrant.grant_ref.content_id,
    ]);

    // The document body never reaches the index either: only titles inside the
    // fixed bound, spans and digests do.
    const serialisedIndex = JSON.stringify(index);
    for (const body of ["예인몸체는", "같은 항목을 다시 정의한다", state.launchPath]) {
      assert.equal(serialisedIndex.includes(body), false, "the index must carry no block body");
    }

    assertDeeplyFrozen(index, "project_pdf_requirement_index");
    assertDeeplyFrozen(receipt, "project_pdf_requirement_index_receipt");
    assert.deepEqual(treeSnapshot(state.tempRoot), before, "nothing under the fixture may change");
  } finally {
    state.cleanup();
  }
});

// ---------------------------------------------------------------- empty index

// A document that declares no requirement identifier at all is still an indexed
// document: an empty index, not a refusal, and one identifier roll-up over the
// empty identifier list.
test("indexes a pinned project pdf that declares no requirement identifier at all", async () => {
  const state = admissionFixture();
  try {
    const { index, receipt } = await buildProjectPdfRequirementIndex({
      launchPath: state.launchPath,
      expectedLaunchSha256: state.expectedLaunchSha256,
      profileId: PROFILE_ID,
    });

    assert.deepEqual(index, expectedIndex(state, [PLAIN_TEXT]));
    assert.deepEqual(receipt, expectedReceipt(state, {
      document: documentEvidence(state, [PLAIN_TEXT]),
      counts: ZERO_COUNTS,
      idsSha256: idsFingerprint([]),
    }));

    assert.equal(receipt.result, "PASS");
    assert.equal(receipt.blocker_code, null);
    assert.equal(receipt.blocker_stage, null);
    assert.equal(index.row_count, 0);
    assert.deepEqual(index.rows, []);
    assert.deepEqual(index.duplicate_ids, []);
    assert.deepEqual(index.mention_only_ids, []);
    assert.deepEqual(receipt.reads, { launch_files: 1, project_documents: 1 });
    assertPayloadFreeReceipt(receipt, [PLAIN_TEXT.trim(), RELATIVE_LOCATOR, state.tempRoot]);
    assertDeeplyFrozen(index, "project_pdf_requirement_index");
  } finally {
    state.cleanup();
  }
});

// ---------------------------------------------------------------- replay

// Same pinned launch, same pinned document, same profile: same index and same
// receipt, and the fixture is exactly as it was found. A seam that carried state
// between calls, or that wrote anything at all, would fail one of these.
test("replays one pinned index deterministically and leaves the fixture untouched", async () => {
  const state = admissionFixture({ documentBytes: specPdf() });
  try {
    const before = treeSnapshot(state.tempRoot);
    const launchDigest = sha256Hex(readFileSync(state.launchPath));
    const documentDigest = sha256Hex(readFileSync(state.documentPath));
    const request = () => ({
      launchPath: state.launchPath,
      expectedLaunchSha256: state.expectedLaunchSha256,
      profileId: PROFILE_ID,
    });

    const first = await buildProjectPdfRequirementIndex(request());
    const second = await buildProjectPdfRequirementIndex(request());

    assert.deepEqual(first, second, "the same pinned document must replay identically");
    assert.notEqual(first, second, "each call must build a fresh result");
    assert.notEqual(first.index, second.index, "each call must build a fresh index");
    assertDeeplyFrozen(first, "first_result");
    assertDeeplyFrozen(second, "second_result");

    assert.equal(sha256Hex(readFileSync(state.launchPath)), launchDigest);
    assert.equal(sha256Hex(readFileSync(state.documentPath)), documentDigest);
    assert.equal(sha256Hex(readFileSync(state.documentPath)), state.documentSha256);
    assert.deepEqual(treeSnapshot(state.tempRoot), before, "nothing under the fixture may change");
  } finally {
    state.cleanup();
  }
});

// ---------------------------------------------------------------- request

// The fixed, payload free blockers, restated rather than imported: a seam that
// renamed one of them would still have to keep this contract.
const REQUEST_INVALID = Object.freeze({
  code: "PROJECT_PDF_REQUIREMENT_INDEX_REQUEST_INVALID",
  stage: "request",
});
const ADMISSION_REFUSED = Object.freeze({
  code: "PROJECT_PDF_REQUIREMENT_INDEX_ADMISSION_REFUSED",
  stage: "admission",
});

const ABSENT_LAUNCH_MARKER = "soulforge-marker-absent-launch-4b19";
const TEMP_MARKER = "soulforge-marker-temp-9e04-";
const LAUNCH_MARKER = "soulforge-marker-launch-1c68";
const LOCATOR_MARKER = "soulforge-marker-locator-7c1e";
const PROXY_MARKER = "soulforge-marker-proxy-8f30";
const ACCESSOR_MARKER = "soulforge-marker-accessor-6b52";

// Recognition knobs, writer surfaces and root overrides. The public request
// carries three own fields, so every one of these must lose to the same fixed
// refusal: a caller that could name its own identifier pattern, gap or cap could
// widen what a requirement is allowed to be.
const FORBIDDEN_REQUEST_FIELDS = [
  "profile",
  "profiles",
  "identifierPattern",
  "labelGap",
  "maxRows",
  "titleRule",
  "sections",
  "persist",
  "writer",
  "model",
  "provider",
  "repoRoot",
  "sourceIds",
  "onProgress",
  "signal",
  "env",
];

// The whole request refusal, as one override: no profile was accepted, nothing
// was admitted, nothing was read and nothing was indexed.
const REFUSED_REQUEST = Object.freeze({
  result: "HOLD",
  blockerCode: REQUEST_INVALID.code,
  blockerStage: REQUEST_INVALID.stage,
  profileId: null,
  admission: NO_ADMISSION_EVIDENCE,
  document: NO_DOCUMENT_EVIDENCE,
  counts: NO_COUNTS,
  idsSha256: null,
  reads: NO_READS,
});

// Every launch named below does not exist, so a refusal that reports the request
// blocker proves the request was closed before admission was started and before
// one file was opened. A refusal that reported the admission blocker instead
// would mean the request reached a reader first.
test("refuses every malformed request before admission opens one file", async () => {
  const state = admissionFixture();
  try {
    const absentLaunch = join(state.tempRoot, `${ABSENT_LAUNCH_MARKER}.json`);
    const before = treeSnapshot(state.tempRoot);
    const ok = () => ({
      launchPath: absentLaunch,
      expectedLaunchSha256: state.expectedLaunchSha256,
      profileId: PROFILE_ID,
    });
    const markers = [ABSENT_LAUNCH_MARKER, PROXY_MARKER, ACCESSOR_MARKER, absentLaunch];
    const refuse = async (request) => {
      const result = await buildProjectPdfRequirementIndex(request);
      assertClosedHold(result, expectedReceipt(state, REFUSED_REQUEST));
      assert.equal(result.receipt.blocker_code, REQUEST_INVALID.code);
      assert.equal(result.receipt.blocker_stage, REQUEST_INVALID.stage);
      assert.deepEqual(result.receipt.reads, NO_READS, "nothing may be read");
      assertPayloadFreeReceipt(result.receipt, markers);
      return result;
    };

    // The profile is a closed list, not a caller supplied rule set.
    assert.deepEqual([...REQUIREMENT_INDEX_PROFILES], [PROFILE_ID]);
    assert.equal(Object.isFrozen(REQUIREMENT_INDEX_PROFILES), true);
    await refuse({ ...ok(), profileId: "kr_defense_spec_v1" });
    await refuse({ ...ok(), profileId: "" });
    await refuse({ ...ok(), profileId: PROFILE_ID.toUpperCase() });
    await refuse({ ...ok(), profileId: ` ${PROFILE_ID}` });
    await refuse({ ...ok(), profileId: null });
    await refuse({ ...ok(), profileId: 7 });
    await refuse({ ...ok(), profileId: ["kr_defense_spec_v0"] });

    await refuse({ ...ok(), launchPath: "" });
    await refuse({ ...ok(), launchPath: 7 });
    await refuse({ ...ok(), expectedLaunchSha256: state.expectedLaunchSha256.toUpperCase() });
    await refuse({ ...ok(), expectedLaunchSha256: state.expectedLaunchSha256.slice(0, 63) });
    await refuse({ ...ok(), expectedLaunchSha256: `sha256:${state.expectedLaunchSha256}` });
    await refuse({ ...ok(), expectedLaunchSha256: null });

    // Exactly three own fields, no more and no fewer.
    await refuse({ launchPath: absentLaunch, expectedLaunchSha256: state.expectedLaunchSha256 });
    await refuse({ profileId: PROFILE_ID });
    await refuse({});
    await refuse(null);
    await refuse("launch");
    await refuse(7);
    await refuse([absentLaunch, state.expectedLaunchSha256, PROFILE_ID]);

    // No recognition knob, no writer surface and no root override may ride in
    // beside the three, under any name and under any key type.
    for (const field of FORBIDDEN_REQUEST_FIELDS) {
      await refuse({ ...ok(), [field]: "ignored" });
    }
    await refuse({ ...ok(), [Symbol("extra")]: "ignored" });

    // An accessor is caller code. A refused request must never run one, so the
    // marker it would have returned can never have been read at all.
    for (const key of ["launchPath", "expectedLaunchSha256", "profileId"]) {
      let reads = 0;
      const accessor = { ...ok() };
      delete accessor[key];
      Object.defineProperty(accessor, key, {
        enumerable: true,
        configurable: true,
        get() { reads += 1; return ACCESSOR_MARKER; },
      });
      await refuse(accessor);
      assert.equal(reads, 0, "a refused request must not invoke one accessor");
    }

    // A root whose prototype is not this seam's own request shape, including the
    // bare null prototype root: three own data fields on an ordinary object is
    // the whole request contract.
    class RequestLike {
      constructor(fields) { Object.assign(this, fields); }
    }
    await refuse(new RequestLike(ok()));
    const bare = Object.create(null);
    Object.assign(bare, ok());
    assert.equal(Object.getPrototypeOf(bare), null);
    await refuse(bare);
    const inherited = Object.create({ inheritedMarker: ACCESSOR_MARKER });
    Object.assign(inherited, ok());
    await refuse(inherited);

    // A proxy answers every later reflection with caller code and a revoked one
    // cannot answer at all, so the root must lose before the first trap capable
    // read. Both handlers are proven live and marked first, and the counter is
    // reset after that setup probe, so the zeros below are traps that could have
    // run during the refusal and did not.
    let traps = 0;
    const marked = () => { traps += 1; return PROXY_MARKER; };
    const handler = {
      get: marked,
      has: () => { traps += 1; return true; },
      getOwnPropertyDescriptor: () => {
        traps += 1;
        return { value: PROXY_MARKER, writable: true, enumerable: true, configurable: true };
      },
      ownKeys: () => {
        traps += 1;
        return ["launchPath", "expectedLaunchSha256", "profileId"];
      },
      getPrototypeOf: () => { traps += 1; return Object.prototype; },
    };

    const live = new Proxy(ok(), handler);
    assert.equal(live.profileId, PROXY_MARKER, "the trap must be installed");
    assert.equal(traps, 1, "the trap must be observable before the refusal");
    traps = 0;
    await refuse(live);
    assert.equal(traps, 0, "a refused request must not run one proxy trap");

    const { proxy, revoke } = Proxy.revocable(ok(), handler);
    assert.equal(proxy.profileId, PROXY_MARKER, "the trap must be installed");
    revoke();
    traps = 0;
    await refuse(proxy);
    assert.equal(traps, 0, "a revoked request must not run one proxy trap");

    // Nothing was opened, and nothing on disk moved.
    assert.deepEqual(treeSnapshot(state.tempRoot), before, "a refused request must touch no file");
  } finally {
    state.cleanup();
  }
});

// ---------------------------------------------------------------- admission

// A launch that does not exist and a launch pinned to other bytes are the same
// refusal, reported the same way and carrying none of the path, the locator or
// the admission seam's own reason. The profile is already accepted, so it is the
// one thing the receipt still reports.
test("holds on a refused admission without echoing the launch it was handed", async () => {
  const state = admissionFixture({ documentBytes: specPdf() });
  try {
    const absentLaunch = join(state.tempRoot, `${ABSENT_LAUNCH_MARKER}.json`);
    const before = treeSnapshot(state.tempRoot);
    const refusedAdmission = expectedReceipt(state, {
      result: "HOLD",
      blockerCode: ADMISSION_REFUSED.code,
      blockerStage: ADMISSION_REFUSED.stage,
      admission: NO_ADMISSION_EVIDENCE,
      document: NO_DOCUMENT_EVIDENCE,
      counts: NO_COUNTS,
      idsSha256: null,
      reads: NO_READS,
    });
    const markers = [
      ABSENT_LAUNCH_MARKER, absentLaunch, state.tempRoot, state.projectRoot,
      RELATIVE_LOCATOR, FILTER_ID, "필터링기능",
      "unreadable", "ENOENT", "ProjectPdfAdmissionError",
    ];

    const absent = await buildProjectPdfRequirementIndex({
      launchPath: absentLaunch,
      expectedLaunchSha256: state.expectedLaunchSha256,
      profileId: PROFILE_ID,
    });
    assertClosedHold(absent, refusedAdmission);
    assert.equal(absent.receipt.profile_id, PROFILE_ID);
    assertPayloadFreeReceipt(absent.receipt, markers);

    const wrongPin = await buildProjectPdfRequirementIndex({
      launchPath: state.launchPath,
      expectedLaunchSha256: "0".repeat(64),
      profileId: PROFILE_ID,
    });
    assertClosedHold(wrongPin, refusedAdmission);
    assertPayloadFreeReceipt(wrongPin.receipt, [...markers, state.launchPath]);

    assert.deepEqual(
      treeSnapshot(state.tempRoot), before, "a refused admission must write nothing",
    );
  } finally {
    state.cleanup();
  }
});

// ---------------------------------------------------------------- titles

// A bracket title is raw document text, so it is carried verbatim or not at all.
// One that names a credential kind, one that carries a long opaque run and one
// past the fixed title bound are each dropped to null, and the row survives with
// its identifier, its section, its span and its digest intact.
const SECRET_TITLE_MARKER = "AKIAZZ7QQ4EXAMPLEKEY0123456789ABCDEF";
const LONG_TITLE_MARKER = "x".repeat(MAX_TITLE_CHARS + 1);
const TITLE_PAGE_LINES = [
  "5.1.1. 보안항목",
  "식별자",
  "R-TB_SEC-SFR-001",
  "요구사양",
  `[api_key ${SECRET_TITLE_MARKER}]`,
  "5.1.2. 긴제목항목",
  "식별자",
  "R-TB_SEC-SFR-002",
  "요구사양",
  `[${LONG_TITLE_MARKER}]`,
];
const TITLE_PAGE_TEXT = extractedText(TITLE_PAGE_LINES);

test("drops a bracket title that could be a secret or is past the title bound", async () => {
  const state = admissionFixture({ documentBytes: syntheticPdf([pageOf(TITLE_PAGE_LINES)]) });
  try {
    const { index, receipt } = await buildProjectPdfRequirementIndex({
      launchPath: state.launchPath,
      expectedLaunchSha256: state.expectedLaunchSha256,
      profileId: PROFILE_ID,
    });

    assert.equal(index.document.text_sha256, `sha256:${sha256Hex(TITLE_PAGE_TEXT)}`);
    assert.equal(receipt.result, "PASS");
    assert.equal(index.row_count, 2);
    assert.deepEqual(
      index.rows.map((row) => row.requirement_id), ["R-TB_SEC-SFR-001", "R-TB_SEC-SFR-002"],
    );
    assert.deepEqual(index.rows.map((row) => row.title), [null, null]);
    assert.deepEqual(index.rows.map((row) => row.section), ["5.1.1.", "5.1.2."]);

    // The dropped titles were really on the page, and neither the index nor the
    // receipt carries one of them.
    assert.equal(TITLE_PAGE_TEXT.includes(SECRET_TITLE_MARKER), true);
    assert.equal(TITLE_PAGE_TEXT.includes(LONG_TITLE_MARKER), true);
    const serialisedIndex = JSON.stringify(index);
    for (const marker of [SECRET_TITLE_MARKER, LONG_TITLE_MARKER, "api_key"]) {
      assert.equal(
        serialisedIndex.includes(marker), false, "a title that could be a secret is not carried",
      );
    }
    assertPayloadFreeReceipt(receipt, [SECRET_TITLE_MARKER, LONG_TITLE_MARKER, "api_key"]);
  } finally {
    state.cleanup();
  }
});

// ---------------------------------------------------------------- markers

// Payload free even against a caller that plants a marker everywhere it can: in
// the temporary root, in the launch file name and in the locator the grant
// commits to.
test("carries no planted marker out of a passing or a refused receipt", async () => {
  const state = admissionFixture({
    documentBytes: specPdf(),
    tempPrefix: TEMP_MARKER,
    launchFileName: `${LAUNCH_MARKER}.json`,
    relativeLocator: `documents/${LOCATOR_MARKER}.pdf`,
  });
  try {
    const markers = [
      TEMP_MARKER, LAUNCH_MARKER, LOCATOR_MARKER,
      state.tempRoot, state.projectRoot, state.launchPath, state.documentPath, state.locator,
      state.projectRef.entity_id,
      state.readGrant.grant_ref.entity_id,
      state.readGrant.grant_ref.content_id,
    ];

    const passing = await buildProjectPdfRequirementIndex({
      launchPath: state.launchPath,
      expectedLaunchSha256: state.expectedLaunchSha256,
      profileId: PROFILE_ID,
    });
    assert.notEqual(passing.index, null, "the marked fixture must still admit and index");
    assert.equal(passing.receipt.result, "PASS");
    assert.equal(passing.receipt.counts.rows, 3);
    assertPayloadFreeReceipt(passing.receipt, markers);
    assert.equal(
      JSON.stringify(passing.index).includes(state.launchPath), false,
      "the index must carry no path",
    );

    const refused = await buildProjectPdfRequirementIndex({
      launchPath: join(state.tempRoot, `${ABSENT_LAUNCH_MARKER}.json`),
      expectedLaunchSha256: state.expectedLaunchSha256,
      profileId: PROFILE_ID,
    });
    assert.equal(refused.index, null);
    assert.equal(refused.receipt.result, "HOLD");
    assertPayloadFreeReceipt(refused.receipt, [...markers, ABSENT_LAUNCH_MARKER]);
  } finally {
    state.cleanup();
  }
});

// ---------------------------------------------------------------- source shape

// The closed shape is a property of the source, not of one lucky run: the
// admission seam is imported once and called once, every recognition rule and
// bound is the seam's own constant rather than anything a caller can name, the
// request key list is exactly three, and the source admits no file, network,
// model, writer, persistence or direct entrypoint surface at all. The bans read
// the code alone: the comments state the contract in prose and name the very
// surfaces the code must not have.
test("pins the read only, index only shape of the requirement index source", () => {
  const source = readFileSync(
    new URL("./project_pdf_requirement_index.mjs", import.meta.url), "utf8",
  );
  const code = source.replace(/\/\*[\s\S]*?\*\//gu, "\n").replace(/^[ \t]*\/\/.*$/gmu, "");
  const count = (pattern) => (code.match(pattern) ?? []).length;

  assert.deepEqual(
    [...code.matchAll(/from "([^"]+)"/gu)].map((match) => match[1]).sort(),
    ["./project_pdf_admission.mjs", "node:crypto", "node:util"],
  );
  assert.equal(count(/\bextractAdmittedProjectPdfCandidate\b/gu), 2, "one import, one call");
  assert.equal(count(/extractAdmittedProjectPdfCandidate\(/gu), 1);
  assert.equal(
    count(/buildProjectPdfRequirementIndex/gu), 1, "nothing may start this seam by itself",
  );

  const requestKeys = code.match(/const REQUEST_KEYS = Object\.freeze\(\[([^\]]*)\]\)/u);
  assert.notEqual(requestKeys, null);
  assert.deepEqual(
    requestKeys[1].split(",").map((key) => key.trim().replace(/"/gu, "")).filter(Boolean),
    ["launchPath", "expectedLaunchSha256", "profileId"],
    "the public request carries exactly three own fields",
  );

  // The profile list and every recognition rule are the seam's own fixed
  // constants: no pattern, gap, cap or title rule is reachable from a caller.
  assert.match(
    code, /export const REQUIREMENT_INDEX_PROFILES = Object\.freeze\(\["kr_defense_spec_v0"\]\);/u,
  );
  assert.equal(
    code.includes(String.raw`/\bR[-_][A-Za-z0-9]+(?:[-_][A-Za-z0-9]+)+\b/gu`), true,
    "the identifier pattern is fixed",
  );
  assert.equal(code.includes(String.raw`/^\d+(?:\.\d+)+\.?/u`), true, "the section rule is fixed");
  assert.match(code, /const IDENTIFIER_LABEL = "식별자";/u);
  assert.match(code, new RegExp(`const MAX_ROWS = ${MAX_ROWS};`, "u"));
  assert.match(code, new RegExp(`const MAX_TITLE_CHARS = ${MAX_TITLE_CHARS};`, "u"));
  assert.match(
    code, new RegExp(`const MAX_LABEL_GAP_CODE_UNITS = ${MAX_LABEL_GAP_CODE_UNITS};`, "u"),
  );

  assert.match(code, /\btypes\.isProxy\(/u, "proxy roots must be refused");
  assert.match(code, /getOwnPropertyDescriptor/u, "accessor requests must be refused");
  assert.match(code, /model_calls: 0/u);
  assert.match(code, /network_calls: 0/u);
  assert.match(code, /rag_index_writes: 0/u);
  assert.match(code, /filesystem_writes: 0/u);
  assert.match(code, /taskdriver_activated: false/u);

  const forbidden = [
    /node:fs\b/u,
    /node:child_process\b/u,
    /node:(http|https|net|tls|dns|dgram)\b/u,
    /node:(process|worker_threads|vm|module|repl|readline|inspector)\b/u,
    /\bfetch\s*\(/u,
    /\brequire\s*\(/u,
    /\bimport\s*\(/u,
    /new Function/u,
    /\beval\s*\(/u,
    /\b(spawn|spawnSync|exec|execSync|execFile|execFileSync)\s*\(/u,
    /\b(writeFile|writeFileSync|appendFile|appendFileSync|createWriteStream|readFile|readFileSync|mkdir|mkdirSync|mkdtemp|mkdtempSync|openSync|rmSync|unlinkSync)\b/u,
    /\b(sqlite|localStorage|indexedDB|redis)\b/iu,
    /\b(anthropic|openai|gemini|claude|huggingface|transformers|onnx|llm|completions)\b/iu,
    /\bprovider\b/iu,
    /\bwriter\b/iu,
    /\bcallback\b/iu,
    /\bhooks?\b/iu,
    /\blistener\b/iu,
    /\bplugin\b/iu,
    /\badapter\b/iu,
    /\bonProgress\b/iu,
    /typeof\s+\w+\s*===\s*"function"/u,
    /\bprocess\b/u,
    /\bargv\b/u,
    /import\.meta/u,
    /\brequire\.main\b/u,
  ];
  for (const pattern of forbidden) {
    assert.equal(pattern.test(code), false, `the requirement index must not use ${pattern.source}`);
  }
});

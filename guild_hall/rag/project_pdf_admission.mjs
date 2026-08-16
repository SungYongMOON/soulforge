// Project pdf admission seam. One pinned launch file names one project scoped
// pdf, and this seam either returns one closed, deep frozen admitted candidate
// or fails closed. The Knowledge View decides admission, a separate document
// read grant pins which single leaf may be opened, and the existing ingest seam
// stays the only thing that touches the pdf bytes. Nothing here elevates the
// validation_only route, opens a second file, or leaves anything behind.
// The command surface over the same admission runs one execution and emits one
// closed receipt to stderr. It is read only, feature off and candidate only: no
// direct invocation block starts it, stdout is never written, and the receipt
// carries counts, booleans and domain separated fingerprints alone.
import { createHash } from "node:crypto";
import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readSync,
  realpathSync,
} from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import process from "node:process";
import { types } from "node:util";

import { canonicalise, compareCodePoints } from "../engineering_engine/kernel/canonical.mjs";
import {
  inspectIdentifierOpacity,
  isWellFormedRef,
  logicalRevisionKey,
  sameExactRef,
} from "../engineering_engine/kernel/identity.mjs";
import { ROOT_STATUS, resolveKnowledgeRoot } from "../shared/knowledge_root_resolver.mjs";
import { comparablePathIdentity } from "../shared/physical_path_identity.mjs";
import { selectProjectKnowledgeView } from "../shared/project_knowledge_view.mjs";
import { extractProjectPdfCandidate } from "./project_document_ingest.mjs";

const LAUNCH_SCHEMA_VERSION = "soulforge.project_pdf_admission_launch.v0";
const READ_GRANT_SCHEMA_VERSION = "soulforge.project_pdf_read_grant.v0";
const ADMITTED_CANDIDATE_SCHEMA_VERSION = "soulforge.admitted_project_pdf_candidate.v0";
const COMMAND_RECEIPT_SCHEMA_VERSION = "soulforge.project_pdf_admission_command_receipt.v0";

// Three separate hash domains. The grant binding, the machine independent
// commitment and the locator commitment answer different questions, so none of
// them may ever be computed under another's domain.
const READ_GRANT_HASH_DOMAIN = "soulforge.project_pdf_admission.document_read_grant.v0";
const PORTABLE_MATERIAL_HASH_DOMAIN = "soulforge.project_pdf_admission.portable_material.v0";
const RELATIVE_LOCATOR_HASH_DOMAIN = "soulforge.project_pdf_admission.relative_locator.v0";
// The resolver's own domain, recomputed here only to compare an observed root
// snapshot against the commitment the Knowledge View already published.
const KNOWLEDGE_ROOT_COMMITMENT_DOMAIN = "soulforge.knowledge_root.local_path.v0";

const READ_GRANT_AUTHORITY_CEILING = "single_pdf_candidate_extraction_only";
const MEDIA_TYPE = "application/pdf";
const FEATURE_STATE = "off";
const VALIDATION_ONLY_ROUTE = "validation_only";
const CANDIDATE_STATUS = "candidate";
const EXTRACTION_ENGINE = "pymupdf";
const COMMAND_MODE = "read_only";
const CANON_CLAIM_CEILING = "observed";

const MAX_LAUNCH_BYTES = 2 * 1024 * 1024;
// In step with the ingest seam's own input cap, so a document this seam admits
// can never be refused later purely for its size.
const MAX_DOCUMENT_BYTES = 16 * 1024 * 1024;
const MAX_PATH_CHARS = 4096;
const MAX_LOCATOR_CHARS = 1024;
const MAX_LOCATOR_SEGMENTS = 64;
const MAX_LOCATOR_SEGMENT_CHARS = 255;

// Exactly four tokens: each flag once, each with one value. No writer, parser,
// provider or root override has a name here to be passed under.
const REQUIRED_FLAGS = Object.freeze(["--launch", "--launch-sha256"]);
const ALLOWED_FLAGS = new Set(REQUIRED_FLAGS);
const ARGV_LENGTH = REQUIRED_FLAGS.length * 2;
const IO_KEYS = Object.freeze(["stdout", "stderr"]);

const REQUEST_KEYS = Object.freeze(["launchPath", "expectedLaunchSha256"]);
const LAUNCH_FIELDS = Object.freeze([
  "schema_version",
  "feature_state",
  "project_knowledge_view_request",
  "project_knowledge_view_authority_grant",
  "expected_project_knowledge_view_authority_grant_ref",
  "document_read_grant",
  "expected_document_read_grant_ref",
]);
const READ_GRANT_FIELDS = Object.freeze([
  "schema_version",
  "feature_state",
  "authority_ceiling",
  "grant_ref",
  "read_policy_ref",
  "project_binding_ref",
  "knowledge_scope_fingerprint_sha256",
  "local_admission_fingerprint_sha256",
  "relative_locator",
  "document_revision_ref",
  "media_type",
]);
// The grant ref commits to every other field of its own grant, so no single
// field can be swapped while the ref still verifies.
const READ_GRANT_MATERIAL_FIELDS = Object.freeze(
  READ_GRANT_FIELDS.filter((field) => field !== "grant_ref"),
);
const EXACT_REF_FIELDS = Object.freeze([
  "entity_id",
  "revision_id",
  "content_id",
  "content_hash_alg",
]);

const SHA256_HEX = /^[0-9a-f]{64}$/u;
const SHA256_CONTENT_ID = /^sha256:[0-9a-f]{64}$/u;
const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/u;
const CANONICAL_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
const CONTENT_DERIVED_REVISION = /^[0-9a-f]{12,64}$/iu;
const NUMBERED_REVISION = /(?:^|[-_.])(?:r|rev|v)\d+(?:[-_.]\d+)*$/iu;
const WINDOWS_UNC_OR_DEVICE_NAMESPACE = /^[\\/]{2}/u;
const WINDOWS_DRIVE_DESIGNATOR = /^[A-Za-z]:(?=[\\/]|$)/u;
const WINDOWS_DEVICE_NAME = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu;
const WINDOWS_TRIMMED_SEGMENT = /[. ](?:[\\/]|$)/u;
const TRAILING_DOT_OR_SPACE = /[. ]$/u;

// Launch bytes are pinned but still untrusted: malformed utf-8 must fail the
// decode rather than turn into replacement characters that could still parse.
const UTF8 = new TextDecoder("utf-8", { fatal: true });

// O_NOFOLLOW is the only way a posix open can refuse a symlinked leaf without a
// window between the check and the open, so its absence fails closed there.
// Windows has no equivalent flag and is covered instead by the lstat, realpath
// and fstat identity checks taken around every open below.
const O_NOFOLLOW = typeof constants.O_NOFOLLOW === "number" ? constants.O_NOFOLLOW : 0;
const O_NONBLOCK = typeof constants.O_NONBLOCK === "number" ? constants.O_NONBLOCK : 0;
const SAFE_READ_OPEN_FLAGS = constants.O_RDONLY | O_NOFOLLOW | O_NONBLOCK;
const SAFE_OPEN_AVAILABLE = process.platform === "win32" || O_NOFOLLOW !== 0;

const FILE_READ = Object.freeze({ UNREADABLE: "unreadable", TOO_LARGE: "too_large" });
const DOCUMENT_READ = Object.freeze({
  ROOT: "root",
  UNREADABLE: "unreadable",
  TOO_LARGE: "too_large",
});

// Fixed, payload free refusals. No path, locator, ref, digest, body or inner
// exception may reach a caller through an error raised here.
const ERROR_NAME = "ProjectPdfAdmissionError";
const ERROR_MESSAGES = Object.freeze({
  request_invalid: "project pdf admission request is invalid",
  launch_unreadable: "project pdf admission launch is unreadable",
  launch_too_large: "project pdf admission launch exceeds the byte cap",
  launch_digest_mismatch: "project pdf admission launch digest does not match the expected pin",
  launch_undecodable: "project pdf admission launch is not decodable json",
  launch_contract_refused: "project pdf admission launch contract is refused",
  read_grant_refused: "project pdf admission document read grant is refused",
  knowledge_view_refused: "project pdf admission knowledge view is refused",
  admission_binding_refused: "project pdf admission binding is refused",
  root_binding_refused: "project pdf admission project root binding is refused",
  locator_refused: "project pdf admission relative locator is refused",
  document_unreadable: "project pdf admission document is unreadable",
  document_too_large: "project pdf admission document exceeds the byte cap",
  document_digest_mismatch:
    "project pdf admission document digest does not match the expected pin",
  candidate_refused: "project pdf admission candidate extraction is refused",
  receipt_failed: "project pdf admission receipt could not be emitted",
});

class ProjectPdfAdmissionError extends Error {
  constructor(code) {
    super(ERROR_MESSAGES[code]);
    Object.defineProperty(this, "name", {
      value: ERROR_NAME,
      writable: true,
      enumerable: false,
      configurable: true,
    });
    this.code = code;
  }
}

function admissionError(code) {
  return new ProjectPdfAdmissionError(code);
}

// Fixed, payload free blocker codes. A command receipt reports one of these and
// nothing else, so no path, locator, ref, body, text or raw exception can ride
// out on a refusal.
const CLI_CODES = Object.freeze({
  IO_INVALID: "PROJECT_PDF_ADMISSION_IO_INVALID",
  ARGUMENTS_INVALID: "PROJECT_PDF_ADMISSION_ARGUMENTS_INVALID",
  LAUNCH_UNREADABLE: "PROJECT_PDF_ADMISSION_LAUNCH_UNREADABLE",
  LAUNCH_TOO_LARGE: "PROJECT_PDF_ADMISSION_LAUNCH_TOO_LARGE",
  LAUNCH_HASH_MISMATCH: "PROJECT_PDF_ADMISSION_LAUNCH_HASH_MISMATCH",
  LAUNCH_NOT_UTF8: "PROJECT_PDF_ADMISSION_LAUNCH_NOT_UTF8",
  LAUNCH_NOT_JSON: "PROJECT_PDF_ADMISSION_LAUNCH_NOT_JSON",
  LAUNCH_CONTRACT_REFUSED: "PROJECT_PDF_ADMISSION_LAUNCH_CONTRACT_REFUSED",
  KNOWLEDGE_VIEW_REFUSED: "PROJECT_PDF_ADMISSION_KNOWLEDGE_VIEW_REFUSED",
  READ_GRANT_REFUSED: "PROJECT_PDF_ADMISSION_READ_GRANT_REFUSED",
  PROJECT_ROOT_REFUSED: "PROJECT_PDF_ADMISSION_PROJECT_ROOT_REFUSED",
  LOCATOR_REFUSED: "PROJECT_PDF_ADMISSION_LOCATOR_REFUSED",
  DOCUMENT_UNREADABLE: "PROJECT_PDF_ADMISSION_DOCUMENT_UNREADABLE",
  DOCUMENT_TOO_LARGE: "PROJECT_PDF_ADMISSION_DOCUMENT_TOO_LARGE",
  DOCUMENT_HASH_MISMATCH: "PROJECT_PDF_ADMISSION_DOCUMENT_HASH_MISMATCH",
  EXTRACTION_REFUSED: "PROJECT_PDF_ADMISSION_EXTRACTION_REFUSED",
  RECEIPT_FAILED: "PROJECT_PDF_ADMISSION_RECEIPT_FAILED",
});

const refusalEntry = (error, code, stage) => Object.freeze({ error, code, stage });

// One refusal table for both seams. The direct seam keeps its stable payload free
// error code and the command surface reports the matching blocker and stage, so
// the two can never drift. The utf-8 and json split exists only to name which of
// the two refused: both stay one `launch_undecodable` refusal on the direct seam.
// The io and arguments entries are command only and are never thrown here.
const REFUSALS = Object.freeze({
  io_invalid: refusalEntry("request_invalid", CLI_CODES.IO_INVALID, "io"),
  arguments_invalid: refusalEntry("request_invalid", CLI_CODES.ARGUMENTS_INVALID, "arguments"),
  launch_unreadable: refusalEntry("launch_unreadable", CLI_CODES.LAUNCH_UNREADABLE, "launch_read"),
  launch_too_large: refusalEntry("launch_too_large", CLI_CODES.LAUNCH_TOO_LARGE, "launch_read"),
  launch_digest_mismatch: refusalEntry(
    "launch_digest_mismatch", CLI_CODES.LAUNCH_HASH_MISMATCH, "launch_binding",
  ),
  launch_not_utf8: refusalEntry("launch_undecodable", CLI_CODES.LAUNCH_NOT_UTF8, "launch_decode"),
  launch_not_json: refusalEntry("launch_undecodable", CLI_CODES.LAUNCH_NOT_JSON, "launch_parse"),
  launch_contract_refused: refusalEntry(
    "launch_contract_refused", CLI_CODES.LAUNCH_CONTRACT_REFUSED, "launch_contract",
  ),
  read_grant_refused: refusalEntry(
    "read_grant_refused", CLI_CODES.READ_GRANT_REFUSED, "read_grant",
  ),
  knowledge_view_refused: refusalEntry(
    "knowledge_view_refused", CLI_CODES.KNOWLEDGE_VIEW_REFUSED, "knowledge_view",
  ),
  admission_binding_refused: refusalEntry(
    "admission_binding_refused", CLI_CODES.READ_GRANT_REFUSED, "read_grant",
  ),
  root_binding_refused: refusalEntry(
    "root_binding_refused", CLI_CODES.PROJECT_ROOT_REFUSED, "project_root",
  ),
  locator_refused: refusalEntry("locator_refused", CLI_CODES.LOCATOR_REFUSED, "locator"),
  document_unreadable: refusalEntry(
    "document_unreadable", CLI_CODES.DOCUMENT_UNREADABLE, "document_read",
  ),
  document_too_large: refusalEntry(
    "document_too_large", CLI_CODES.DOCUMENT_TOO_LARGE, "document_read",
  ),
  document_digest_mismatch: refusalEntry(
    "document_digest_mismatch", CLI_CODES.DOCUMENT_HASH_MISMATCH, "document_binding",
  ),
  candidate_refused: refusalEntry("candidate_refused", CLI_CODES.EXTRACTION_REFUSED, "extraction"),
  receipt_failed: refusalEntry("receipt_failed", CLI_CODES.RECEIPT_FAILED, "receipt"),
});

// Private refusal sentinel. It carries one fixed table key, is never exported and
// never escapes the admission pipeline, so nothing observed can travel on it.
class AdmissionRefusal {
  constructor(key) {
    this.key = key;
  }
}

function refuse(key) {
  return new AdmissionRefusal(key);
}

// An unexpected throw becomes the refusal of the stage it happened in, so the
// pipeline still fails closed on a fixed table key instead of a raw exception.
function refusalKeyOf(error, fallback) {
  return error instanceof AdmissionRefusal && Object.hasOwn(REFUSALS, error.key)
    ? error.key
    : fallback;
}

/**
 * Admits one pinned launch and returns one closed admitted project pdf candidate.
 *
 * The order below is the safe sequence and is not an implementation detail: the
 * launch bytes are pinned before they are decoded, the Knowledge View decides
 * admission before any project root is touched, and the single leaf is opened
 * only after its locator, its root binding and its own digest pin are settled.
 */
export async function extractAdmittedProjectPdfCandidate(request) {
  const { launchPath, expectedLaunchSha256 } = prepareRequest(request);
  const outcome = await admitOnce(launchPath, expectedLaunchSha256);
  if (outcome.refusal !== null) throw admissionError(REFUSALS[outcome.refusal].error);
  return outcome.candidate;
}

// One execution of the safe sequence. The launch file is read once, the single
// leaf is read once, the fixed extractor is started once, and the same run yields
// both the admitted candidate and the evidence the command receipt reports.
async function admitOnce(launchPath, expectedLaunchSha256) {
  const evidence = freshEvidence();
  let fallback = "launch_unreadable";
  try {
    const launchBytes = readPinnedLaunchBytes(launchPath, expectedLaunchSha256, evidence);
    evidence.launch.pin_verified = true;
    evidence.launch.sha256 = expectedLaunchSha256;
    evidence.launch.byte_count = launchBytes.length;

    fallback = "launch_not_json";
    const launch = parseLaunchDocument(launchBytes);
    fallback = "launch_contract_refused";
    const readGrant = admitLaunchContract(launch);
    fallback = "knowledge_view_refused";
    const view = selectView(launch);
    admitKnowledgeView(view, readGrant, evidence);

    fallback = "root_binding_refused";
    const authorityGrant = launch.project_knowledge_view_authority_grant;
    const rootCommitment = verifyProjectRootBinding(
      authorityGrant.project_root_path,
      authorityGrant.containment_root_path,
      view,
    );
    fallback = "locator_refused";
    const locatorSegments = relativeLocatorSegments(readGrant.relative_locator);
    if (locatorSegments === null) throw refuse("locator_refused");

    fallback = "document_unreadable";
    const documentBytes = readPinnedProjectDocument({
      projectRootPath: authorityGrant.project_root_path,
      locatorSegments,
      expectedRootCommitment: rootCommitment,
      readGrant,
      evidence,
    });
    fallback = "candidate_refused";
    const ingestCandidate = await extractCandidateOnce(documentBytes, evidence.document.sha256);
    recordExtraction(evidence, ingestCandidate);
    fallback = "admission_binding_refused";
    const candidate = buildAdmittedCandidate({ view, readGrant, ingestCandidate });
    evidence.admission.portable_material_fingerprint_sha256 =
      candidate.admission.portable_material_fingerprint_sha256;
    evidence.admission.relative_locator_fingerprint_sha256 =
      candidate.admission.relative_locator_fingerprint_sha256;
    return { refusal: null, candidate, evidence };
  } catch (error) {
    return { refusal: refusalKeyOf(error, fallback), candidate: null, evidence };
  }
}

// ---------------------------------------------------------------- request

// Closed own-data request. Two keys, both ordinary values, nothing else: no path
// override, no root override, no hook and no writer surface can be smuggled in
// beside them.
function prepareRequest(request) {
  if (!ordinaryDataObject(request)) throw admissionError("request_invalid");
  if (Reflect.ownKeys(request).length !== REQUEST_KEYS.length) {
    throw admissionError("request_invalid");
  }
  const [launchPath, expectedLaunchSha256] = REQUEST_KEYS.map(
    (key) => readOwnDataValue(request, key),
  );
  if (refusedAbsoluteFilePath(launchPath)) throw admissionError("request_invalid");
  if (typeof expectedLaunchSha256 !== "string" || !SHA256_HEX.test(expectedLaunchSha256)) {
    throw admissionError("request_invalid");
  }
  return { launchPath, expectedLaunchSha256 };
}

function readOwnDataValue(request, key) {
  const descriptor = Object.getOwnPropertyDescriptor(request, key);
  if (!descriptor || !Object.hasOwn(descriptor, "value")) throw admissionError("request_invalid");
  return descriptor.value;
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

// ---------------------------------------------------------------- launch

// The outer pin is verified over the raw bytes, before any decode, any parse and
// any root access, so a launch that does not match never reaches a reader.
function readPinnedLaunchBytes(launchPath, expectedLaunchSha256, evidence) {
  const read = readBoundedNamedFile(launchPath, MAX_LAUNCH_BYTES);
  if (read.bytes === undefined) {
    throw refuse(
      read.refusal === FILE_READ.TOO_LARGE ? "launch_too_large" : "launch_unreadable",
    );
  }
  // These bytes were opened and read to be able to compare the pin at all, so
  // the read is counted here rather than after a comparison that may refuse it.
  // Only the count moves: the digest and the byte size stay behind the pin.
  evidence.reads.launch_files = 1;
  if (createHash("sha256").update(read.bytes).digest("hex") !== expectedLaunchSha256) {
    throw refuse("launch_digest_mismatch");
  }
  return read.bytes;
}

// The pin is already settled over these bytes, so the decode and the parse are
// split here only to name which of the two refused. Malformed utf-8 must fail the
// decode rather than turn into replacement characters that could still parse, and
// both refusals stay one `launch_undecodable` on the direct seam.
function parseLaunchDocument(launchBytes) {
  let text;
  try {
    text = UTF8.decode(launchBytes);
  } catch {
    throw refuse("launch_not_utf8");
  }
  try {
    return JSON.parse(text);
  } catch {
    throw refuse("launch_not_json");
  }
}

function admitLaunchContract(launch) {
  if (!exactKeys(launch, LAUNCH_FIELDS)
      || launch.schema_version !== LAUNCH_SCHEMA_VERSION
      || launch.feature_state !== FEATURE_STATE
      || !ordinaryDataObject(launch.project_knowledge_view_request)
      || !ordinaryDataObject(launch.project_knowledge_view_authority_grant)
      || !validExactRef(launch.expected_project_knowledge_view_authority_grant_ref)
      || !validExactRef(launch.expected_document_read_grant_ref)) {
    throw refuse("launch_contract_refused");
  }
  return admitDocumentReadGrant(
    launch.document_read_grant,
    launch.expected_document_read_grant_ref,
  );
}

function admitDocumentReadGrant(grant, expectedGrantRef) {
  if (!exactKeys(grant, READ_GRANT_FIELDS)
      || grant.schema_version !== READ_GRANT_SCHEMA_VERSION
      || grant.feature_state !== FEATURE_STATE
      || grant.authority_ceiling !== READ_GRANT_AUTHORITY_CEILING
      || grant.media_type !== MEDIA_TYPE
      || typeof grant.knowledge_scope_fingerprint_sha256 !== "string"
      || !SHA256_CONTENT_ID.test(grant.knowledge_scope_fingerprint_sha256)
      || typeof grant.local_admission_fingerprint_sha256 !== "string"
      || !SHA256_CONTENT_ID.test(grant.local_admission_fingerprint_sha256)
      || typeof grant.relative_locator !== "string"
      || !validExactRef(grant.grant_ref)
      || !validExactRef(grant.read_policy_ref)
      || !validExactRef(grant.project_binding_ref)
      || !validExactRef(grant.document_revision_ref)
      || !sameExactRef(grant.grant_ref, expectedGrantRef)
      || grant.grant_ref.content_id !== documentReadGrantContentId(grant)) {
    throw refuse("read_grant_refused");
  }
  return grant;
}

function documentReadGrantContentId(grant) {
  const material = {};
  for (const field of READ_GRANT_MATERIAL_FIELDS) material[field] = grant[field];
  return canonicalFingerprint(READ_GRANT_HASH_DOMAIN, material);
}

// ---------------------------------------------------------------- admission

function selectView(launch) {
  try {
    return selectProjectKnowledgeView(
      launch.project_knowledge_view_request,
      launch.project_knowledge_view_authority_grant,
      launch.expected_project_knowledge_view_authority_grant_ref,
    );
  } catch {
    throw refuse("knowledge_view_refused");
  }
}

// The view is the admission decision and this seam reads it as it stands: a
// validation_only route with project_read_allowed false stays exactly that. The
// separate document read grant is what permits the one bounded leaf read, and it
// must commit to the same project, the same scope and the same local admission.
// Each binding is checked on its own so the receipt can report which ones held.
function admitKnowledgeView(view, readGrant, evidence) {
  if (!ordinaryDataObject(view)
      || view.route !== VALIDATION_ONLY_ROUTE
      || view.feature_state !== FEATURE_STATE
      || !ordinaryDataObject(view.authority)
      || view.authority.project_read_allowed !== false) {
    throw refuse("knowledge_view_refused");
  }
  evidence.admission.knowledge_view_verified = true;
  if (!sameExactRef(view.project_binding_ref, readGrant.project_binding_ref)) {
    throw refuse("admission_binding_refused");
  }
  evidence.admission.project_binding_verified = true;
  if (view.knowledge_scope_fingerprint_sha256 !== readGrant.knowledge_scope_fingerprint_sha256
      || view.local_admission_fingerprint_sha256
        !== readGrant.local_admission_fingerprint_sha256) {
    throw refuse("admission_binding_refused");
  }
  evidence.admission.local_admission_verified = true;
  if (!separateReadGrant(view, readGrant)) throw refuse("admission_binding_refused");
  evidence.admission.document_read_grant_binding_verified = true;
}

// A read grant that reused the authority grant, the policy, the project binding
// or the document revision in another role would let one approval stand in for
// two, so every role here names a distinct subject and a distinct revision.
function separateReadGrant(view, readGrant) {
  const roleRefs = [
    view.project_binding_ref,
    view.authority_grant_ref,
    view.policy_ref,
    readGrant.grant_ref,
    readGrant.read_policy_ref,
    readGrant.document_revision_ref,
  ];
  const entityIds = new Set(roleRefs.map((ref) => ref?.entity_id));
  const revisionKeys = new Set(roleRefs.map(logicalRevisionKey));
  return entityIds.size === roleRefs.length
    && revisionKeys.size === roleRefs.length
    && !revisionKeys.has(null);
}

// The project root path is taken from the owned parsed authority grant alone,
// and the resolution is repeated here rather than inherited: the view's
// commitment is only evidence of what it observed, so this seam observes the
// root again and refuses if the two disagree.
function verifyProjectRootBinding(projectRootPath, containmentRootPath, view) {
  if (refusedAbsoluteFilePath(projectRootPath)) throw refuse("root_binding_refused");
  let resolution;
  try {
    resolution = resolveKnowledgeRoot(projectRootPath, { containmentRoot: containmentRootPath });
  } catch {
    throw refuse("root_binding_refused");
  }
  if (resolution.status !== ROOT_STATUS.RESOLVED
      || typeof resolution.local_path_commitment_sha256 !== "string"
      || !SHA256_CONTENT_ID.test(resolution.local_path_commitment_sha256)
      || resolution.local_path_commitment_sha256
        !== view.project_root_local_path_commitment_sha256) {
    throw refuse("root_binding_refused");
  }
  return resolution.local_path_commitment_sha256;
}

// ---------------------------------------------------------------- extraction

// The one leaf read and its pin. A document whose bytes do not match the exact
// revision content id contributes neither a digest nor a size, so a mismatch can
// never ride out on the receipt.
function readPinnedProjectDocument({
  projectRootPath,
  locatorSegments,
  expectedRootCommitment,
  readGrant,
  evidence,
}) {
  const documentRead = readBoundedProjectDocument({
    projectRootPath,
    locatorSegments,
    expectedRootCommitment,
    maxBytes: MAX_DOCUMENT_BYTES,
  });
  if (documentRead.bytes === undefined) {
    if (documentRead.refusal === DOCUMENT_READ.ROOT) throw refuse("root_binding_refused");
    throw refuse(
      documentRead.refusal === DOCUMENT_READ.TOO_LARGE
        ? "document_too_large"
        : "document_unreadable",
    );
  }
  evidence.reads.project_documents = 1;
  evidence.document.stable_open_verified = true;

  // Nothing else in the grant carries the document digest, so the exact revision
  // content id is the pin the opened bytes must satisfy.
  const expectedDocumentSha256 = readGrant.document_revision_ref.content_id.slice("sha256:".length);
  if (createHash("sha256").update(documentRead.bytes).digest("hex") !== expectedDocumentSha256) {
    throw refuse("document_digest_mismatch");
  }
  evidence.document.pin_verified = true;
  evidence.document.sha256 = expectedDocumentSha256;
  evidence.document.byte_count = documentRead.bytes.length;
  return documentRead.bytes;
}

// The reported extraction is bounded to safe scalars before anything is copied
// out of it, so only a fixed engine name, two counts and one digest can be
// reported. Page text is never carried anywhere near a receipt.
function acceptedExtraction(extraction) {
  return ordinaryDataObject(extraction)
    && extraction.engine === EXTRACTION_ENGINE
    && Number.isSafeInteger(extraction.page_count) && extraction.page_count >= 1
    && Number.isSafeInteger(extraction.character_count) && extraction.character_count >= 0
    && typeof extraction.text_sha256 === "string" && SHA256_HEX.test(extraction.text_sha256);
}

async function extractCandidateOnce(documentBytes, expectedDocumentSha256) {
  let candidate;
  try {
    candidate = await extractProjectPdfCandidate({
      pdfBytes: documentBytes,
      expectedSha256: expectedDocumentSha256,
    });
  } catch {
    throw refuse("candidate_refused");
  }
  if (!ordinaryDataObject(candidate)
      || candidate.status !== CANDIDATE_STATUS
      || !ordinaryDataObject(candidate.source)
      || candidate.source.media_type !== MEDIA_TYPE
      || candidate.source.sha256 !== expectedDocumentSha256
      || !acceptedExtraction(candidate.extraction)) {
    throw refuse("candidate_refused");
  }
  return candidate;
}

function buildAdmittedCandidate({ view, readGrant, ingestCandidate }) {
  // Portable: this carries the path independent scope commitment and no local
  // admission observation, so it survives a move to another machine.
  const portableFingerprint = canonicalFingerprint(PORTABLE_MATERIAL_HASH_DOMAIN, {
    project_binding_ref: readGrant.project_binding_ref,
    knowledge_scope_fingerprint_sha256: readGrant.knowledge_scope_fingerprint_sha256,
    read_policy_ref: readGrant.read_policy_ref,
    relative_locator: readGrant.relative_locator,
    document_revision_ref: readGrant.document_revision_ref,
    media_type: readGrant.media_type,
  });
  const locatorFingerprint = canonicalFingerprint(RELATIVE_LOCATOR_HASH_DOMAIN, {
    project_binding_ref: readGrant.project_binding_ref,
    relative_locator: readGrant.relative_locator,
    document_revision_ref: readGrant.document_revision_ref,
  });
  if (portableFingerprint === null || locatorFingerprint === null) {
    throw refuse("admission_binding_refused");
  }
  return deepFreeze({
    schema_version: ADMITTED_CANDIDATE_SCHEMA_VERSION,
    kind: "admitted_project_pdf_candidate",
    status: CANDIDATE_STATUS,
    feature_state: FEATURE_STATE,
    route: view.route,
    admission: {
      project_binding_ref: cloneRef(readGrant.project_binding_ref),
      document_revision_ref: cloneRef(readGrant.document_revision_ref),
      document_read_grant_ref: cloneRef(readGrant.grant_ref),
      knowledge_scope_fingerprint_sha256: view.knowledge_scope_fingerprint_sha256,
      local_admission_fingerprint_sha256: view.local_admission_fingerprint_sha256,
      portable_material_fingerprint_sha256: portableFingerprint,
      relative_locator_fingerprint_sha256: locatorFingerprint,
      knowledge_view_project_read_allowed: view.authority.project_read_allowed,
      document_read_grant_binding_verified: true,
    },
    ingest_candidate: ingestCandidate,
    authority: {
      source_truth: false,
      canon: false,
      project_state: false,
      approval: false,
      engine_input_allowed: false,
      activation_allowed: false,
      wiki_write_allowed: false,
      rag_write_allowed: false,
      erp_write_allowed: false,
      taskdriver_allowed: false,
    },
    effects: {
      persistent_writes: 0,
      network_calls: 0,
      model_calls: 0,
      rag_index_writes: 0,
      wiki_writes: 0,
      engine_calls: 0,
    },
  });
}

// ---------------------------------------------------------------- shapes

function exactKeys(value, expected) {
  if (!ordinaryDataObject(value)) return false;
  if (Reflect.ownKeys(value).length !== expected.length) return false;
  const actual = Object.keys(value).sort(compareCodePoints);
  const required = [...expected].sort(compareCodePoints);
  return actual.every((key, index) => key === required[index]);
}

// An exact ref names which subject, which revision and which bytes. A revision
// that is not a canonical uuid, a content derived digest or a numbered revision
// is refused, because a floating revision would let the pinned bytes move.
function validExactRef(ref) {
  return exactKeys(ref, EXACT_REF_FIELDS)
    && isWellFormedRef(ref)
    && ref.content_hash_alg === "sha256"
    && SHA256_CONTENT_ID.test(ref.content_id)
    && SAFE_IDENTIFIER.test(ref.entity_id)
    && SAFE_IDENTIFIER.test(ref.revision_id)
    && inspectIdentifierOpacity(ref.entity_id).opaque === true
    && inspectIdentifierOpacity(ref.revision_id).opaque === true
    && (CANONICAL_UUID.test(ref.revision_id)
      || CONTENT_DERIVED_REVISION.test(ref.revision_id)
      || NUMBERED_REVISION.test(ref.revision_id));
}

function cloneRef(ref) {
  return {
    entity_id: ref.entity_id,
    revision_id: ref.revision_id,
    content_id: ref.content_id,
    content_hash_alg: ref.content_hash_alg,
  };
}

function deepFreeze(value) {
  if (value === null || typeof value !== "object") return value;
  for (const key of Object.keys(value)) deepFreeze(value[key]);
  return Object.freeze(value);
}

// ---------------------------------------------------------------- fingerprints

function insertionOrderRules(value) {
  const rules = {};
  const visit = (node, path = "") => {
    if (Array.isArray(node)) {
      rules[path] = "insertion_ordered";
      for (const child of node) visit(child, `${path}[]`);
    } else if (node !== null && typeof node === "object") {
      for (const [key, child] of Object.entries(node)) {
        visit(child, path ? `${path}.${key}` : key);
      }
    }
  };
  visit(value);
  return rules;
}

// The hash domain, a NUL separator, then the canonical serialisation of the
// material. A material that cannot be canonicalised has no fingerprint at all,
// so it yields null and every comparison against it fails closed.
function canonicalFingerprint(domain, material) {
  try {
    return `sha256:${createHash("sha256")
      .update(`${domain}\0`, "utf8")
      .update(canonicalise(material, insertionOrderRules(material)), "utf8")
      .digest("hex")}`;
  } catch {
    return null;
  }
}

function rootPathCommitment(snapshot) {
  return `sha256:${createHash("sha256")
    .update(`${KNOWLEDGE_ROOT_COMMITMENT_DOMAIN}\0`, "utf8")
    .update(snapshot.comparable_real_path, "utf8")
    .digest("hex")}`;
}

// ---------------------------------------------------------------- path forms

function controlFree(value) {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 0x20 || code === 0x7f) return false;
  }
  return true;
}

function refusedAbsoluteFilePath(value) {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_PATH_CHARS
      || !controlFree(value) || value.normalize("NFC") !== value || !isAbsolute(value)
      || resolve(value) !== value || WINDOWS_UNC_OR_DEVICE_NAMESPACE.test(value)) return true;
  if (process.platform !== "win32") return false;
  if (WINDOWS_TRIMMED_SEGMENT.test(value)) return true;
  const colonStart = WINDOWS_DRIVE_DESIGNATOR.test(value) ? 2 : 0;
  if (value.includes(":", colonStart)) return true;
  return value.split(/[\\/]/u).filter(Boolean).some((segment) => WINDOWS_DEVICE_NAME.test(segment));
}

// A locator names one leaf below the admitted project root and nothing else: it
// is relative, forward slashed, free of traversal, and free of the windows alias
// forms that resolve to a different file than the one that was checked.
function relativeLocatorSegments(value) {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_LOCATOR_CHARS
      || !controlFree(value) || value.normalize("NFC") !== value || isAbsolute(value)
      || WINDOWS_UNC_OR_DEVICE_NAMESPACE.test(value) || /^[A-Za-z]:/u.test(value)
      || value.includes("\\") || value.includes(":")) return null;
  const segments = value.split("/");
  if (segments.length === 0 || segments.length > MAX_LOCATOR_SEGMENTS) return null;
  for (const segment of segments) {
    if (segment.length === 0 || segment.length > MAX_LOCATOR_SEGMENT_CHARS
        || segment === "." || segment === ".."
        || TRAILING_DOT_OR_SPACE.test(segment)
        || WINDOWS_DEVICE_NAME.test(segment)) return null;
  }
  return segments;
}

// ---------------------------------------------------------------- stable reads

function fileState(stat) {
  const state = {
    dev: stat.dev,
    ino: stat.ino,
    nlink: stat.nlink,
    size: stat.size,
    mtimeNs: stat.mtimeNs,
    ctimeNs: stat.ctimeNs,
  };
  return Object.values(state).every((value) => typeof value === "bigint") ? state : null;
}

function sameFileState(left, right) {
  return left !== null && right !== null
    && left.dev === right.dev && left.ino === right.ino
    && left.nlink === right.nlink && left.size === right.size
    && left.mtimeNs === right.mtimeNs && left.ctimeNs === right.ctimeNs;
}

// One name, one ordinary file, one link: the held descriptor and the named entry
// must be the same object, so the bytes that were measured are the bytes read.
function oneNamedOrdinaryFile(held, named) {
  return held.isFile() && named.isFile() && held.ino !== 0n
    && held.nlink === 1n && named.nlink === 1n
    && held.dev === named.dev && held.ino === named.ino;
}

function preflightBoundedNamedFile(path, maxBytes) {
  try {
    const named = lstatSync(path, { bigint: true });
    const namedState = fileState(named);
    if (!named.isFile() || named.isSymbolicLink() || named.ino === 0n
        || named.nlink !== 1n || named.size === 0n || namedState === null) {
      return { refusal: FILE_READ.UNREADABLE };
    }
    if (named.size > BigInt(maxBytes)) return { refusal: FILE_READ.TOO_LARGE };
    const namedRealPath = realpathSync.native(path);
    if (comparablePathIdentity(namedRealPath) !== comparablePathIdentity(path)) {
      return { refusal: FILE_READ.UNREADABLE };
    }
    return { namedState, namedRealPath };
  } catch {
    return { refusal: FILE_READ.UNREADABLE };
  }
}

function readAllBytes(descriptor, size) {
  const bytes = Buffer.alloc(size);
  let offset = 0;
  while (offset < size) {
    const count = readSync(descriptor, bytes, offset, size - offset, offset);
    if (count === 0) return null;
    offset += count;
  }
  // A file still holding bytes past the measured size is not the file that was
  // measured, so the whole read is discarded rather than silently truncated.
  if (readSync(descriptor, Buffer.alloc(1), 0, 1, size) !== 0) return null;
  return bytes;
}

function closeQuietly(descriptor) {
  if (descriptor === null) return;
  try {
    closeSync(descriptor);
  } catch {
    // This descriptor was opened read-only and carries no persistent authority.
  }
}

function readBoundedNamedFile(path, maxBytes) {
  if (!SAFE_OPEN_AVAILABLE) return { refusal: FILE_READ.UNREADABLE };
  const preflight = preflightBoundedNamedFile(path, maxBytes);
  if (preflight.namedState === undefined) return { refusal: preflight.refusal };
  let descriptor = null;
  try {
    descriptor = openSync(path, SAFE_READ_OPEN_FLAGS);
    const opened = fstatSync(descriptor, { bigint: true });
    const named = lstatSync(path, { bigint: true });
    const openedState = fileState(opened);
    const namedState = fileState(named);
    const namedRealPath = realpathSync.native(path);
    if (!oneNamedOrdinaryFile(opened, named) || opened.size === 0n
        || openedState === null || namedState === null
        || !sameFileState(preflight.namedState, namedState)
        || comparablePathIdentity(namedRealPath)
          !== comparablePathIdentity(preflight.namedRealPath)) {
      return { refusal: FILE_READ.UNREADABLE };
    }
    if (opened.size > BigInt(maxBytes)) return { refusal: FILE_READ.TOO_LARGE };

    const bytes = readAllBytes(descriptor, Number(opened.size));
    if (bytes === null) return { refusal: FILE_READ.UNREADABLE };
    const closing = fstatSync(descriptor, { bigint: true });
    const closingNamed = lstatSync(path, { bigint: true });
    if (!oneNamedOrdinaryFile(closing, closingNamed)
        || !sameFileState(openedState, fileState(closing))
        || !sameFileState(namedState, fileState(closingNamed))) {
      return { refusal: FILE_READ.UNREADABLE };
    }
    return { bytes };
  } catch {
    return { refusal: FILE_READ.UNREADABLE };
  } finally {
    closeQuietly(descriptor);
  }
}

function rootSnapshot(path) {
  try {
    const named = lstatSync(path, { bigint: true });
    const state = fileState(named);
    if (!named.isDirectory() || named.isSymbolicLink() || named.ino === 0n || state === null) {
      return null;
    }
    const realPath = realpathSync.native(path);
    return {
      state,
      real_path: realPath,
      comparable_real_path: comparablePathIdentity(realPath),
    };
  } catch {
    return null;
  }
}

function sameRootSnapshot(left, right) {
  return left !== null && right !== null
    && left.comparable_real_path === right.comparable_real_path
    && sameFileState(left.state, right.state);
}

function directoryChainSnapshot(root, segments) {
  const snapshots = [];
  let lexical = root.real_path;
  for (const segment of segments.slice(0, -1)) {
    lexical = join(lexical, segment);
    try {
      const named = lstatSync(lexical, { bigint: true });
      const state = fileState(named);
      if (!named.isDirectory() || named.isSymbolicLink() || named.ino === 0n || state === null) {
        return null;
      }
      const realPath = realpathSync.native(lexical);
      if (comparablePathIdentity(realPath) !== comparablePathIdentity(lexical)) return null;
      snapshots.push({ state, comparable_real_path: comparablePathIdentity(realPath) });
    } catch {
      return null;
    }
  }
  return snapshots;
}

function sameDirectoryChain(left, right) {
  return left !== null && right !== null && left.length === right.length
    && left.every((entry, index) => (
      entry.comparable_real_path === right[index].comparable_real_path
      && sameFileState(entry.state, right[index].state)
    ));
}

// The one leaf read. The admitted root and every directory between it and the
// leaf are snapshotted, rechecked around the open and rechecked again after the
// read, so a root or an ancestor swapped underneath mid read is refused instead
// of quietly redirecting the read outside the admitted project.
function readBoundedProjectDocument({
  projectRootPath,
  locatorSegments,
  expectedRootCommitment,
  maxBytes,
}) {
  if (!SAFE_OPEN_AVAILABLE) return { refusal: DOCUMENT_READ.UNREADABLE };
  const root = rootSnapshot(projectRootPath);
  if (root === null || rootPathCommitment(root) !== expectedRootCommitment) {
    return { refusal: DOCUMENT_READ.ROOT };
  }
  const ancestors = directoryChainSnapshot(root, locatorSegments);
  if (ancestors === null) return { refusal: DOCUMENT_READ.UNREADABLE };

  const documentPath = join(root.real_path, ...locatorSegments);
  const preflight = preflightBoundedNamedFile(documentPath, maxBytes);
  if (!sameRootSnapshot(root, rootSnapshot(projectRootPath))
      || !sameDirectoryChain(ancestors, directoryChainSnapshot(root, locatorSegments))) {
    return { refusal: DOCUMENT_READ.ROOT };
  }
  if (preflight.namedState === undefined) {
    return {
      refusal: preflight.refusal === FILE_READ.TOO_LARGE
        ? DOCUMENT_READ.TOO_LARGE
        : DOCUMENT_READ.UNREADABLE,
    };
  }

  let descriptor = null;
  try {
    descriptor = openSync(documentPath, SAFE_READ_OPEN_FLAGS);
    const opened = fstatSync(descriptor, { bigint: true });
    const named = lstatSync(documentPath, { bigint: true });
    const openedState = fileState(opened);
    const namedState = fileState(named);
    const documentReal = realpathSync.native(documentPath);
    if (!oneNamedOrdinaryFile(opened, named) || opened.size === 0n
        || openedState === null || namedState === null
        || !sameFileState(preflight.namedState, namedState)
        || comparablePathIdentity(documentReal)
          !== comparablePathIdentity(preflight.namedRealPath)
        || comparablePathIdentity(documentReal) !== comparablePathIdentity(documentPath)) {
      return { refusal: DOCUMENT_READ.UNREADABLE };
    }
    if (opened.size > BigInt(maxBytes)) return { refusal: DOCUMENT_READ.TOO_LARGE };
    if (!sameRootSnapshot(root, rootSnapshot(projectRootPath))
        || !sameDirectoryChain(ancestors, directoryChainSnapshot(root, locatorSegments))) {
      return { refusal: DOCUMENT_READ.ROOT };
    }

    const bytes = readAllBytes(descriptor, Number(opened.size));
    if (bytes === null) return { refusal: DOCUMENT_READ.UNREADABLE };
    const closing = fstatSync(descriptor, { bigint: true });
    const closingNamed = lstatSync(documentPath, { bigint: true });
    const closingReal = realpathSync.native(documentPath);
    if (!oneNamedOrdinaryFile(closing, closingNamed)
        || !sameFileState(openedState, fileState(closing))
        || !sameFileState(namedState, fileState(closingNamed))
        || comparablePathIdentity(closingReal) !== comparablePathIdentity(documentReal)) {
      return { refusal: DOCUMENT_READ.UNREADABLE };
    }
    if (!sameRootSnapshot(root, rootSnapshot(projectRootPath))
        || !sameDirectoryChain(ancestors, directoryChainSnapshot(root, locatorSegments))) {
      return { refusal: DOCUMENT_READ.ROOT };
    }
    return { bytes };
  } catch {
    return { refusal: DOCUMENT_READ.UNREADABLE };
  } finally {
    closeQuietly(descriptor);
  }
}

// ---------------------------------------------------------------- evidence

// What one execution actually verified. Every field is a boolean, a count or a
// digest that was already committed to, and each is filled only after the check
// it reports has passed, so a refused run carries only the evidence it reached.
function freshEvidence() {
  return {
    launch: { pin_verified: false, sha256: null, byte_count: null },
    admission: {
      knowledge_view_verified: false,
      document_read_grant_binding_verified: false,
      project_binding_verified: false,
      local_admission_verified: false,
      portable_material_fingerprint_sha256: null,
      relative_locator_fingerprint_sha256: null,
    },
    document: {
      stable_open_verified: false,
      pin_verified: false,
      sha256: null,
      byte_count: null,
    },
    extraction: {
      completed: false,
      engine: null,
      page_count: null,
      character_count: null,
      text_sha256: null,
    },
    reads: { launch_files: 0, project_documents: 0 },
  };
}

function recordExtraction(evidence, ingestCandidate) {
  evidence.extraction.completed = true;
  evidence.extraction.engine = ingestCandidate.extraction.engine;
  evidence.extraction.page_count = ingestCandidate.extraction.page_count;
  evidence.extraction.character_count = ingestCandidate.extraction.character_count;
  evidence.extraction.text_sha256 = ingestCandidate.extraction.text_sha256;
}

// The receipt is the whole observable output of the command: counted reads,
// counted effects, verified pins and refused gates. Every value is a boolean, a
// count, a fixed enum or a domain separated fingerprint, so no path, locator,
// ref, body, extracted text or mismatch digest is carried out on it.
function commandReceipt(evidence, refusalKey) {
  const refused = refusalKey !== null;
  return deepFreeze({
    schema_version: COMMAND_RECEIPT_SCHEMA_VERSION,
    mode: COMMAND_MODE,
    feature_state: FEATURE_STATE,
    result: refused ? "HOLD" : "PASS",
    blocker_code: refused ? REFUSALS[refusalKey].code : null,
    blocker_stage: refused ? REFUSALS[refusalKey].stage : null,
    launch: {
      pin_verified: evidence.launch.pin_verified,
      sha256: evidence.launch.sha256,
      byte_count: evidence.launch.byte_count,
    },
    admission: {
      knowledge_view_verified: evidence.admission.knowledge_view_verified,
      knowledge_view_project_read_allowed: false,
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
      stable_open_verified: evidence.document.stable_open_verified,
      pin_verified: evidence.document.pin_verified,
      sha256: evidence.document.sha256,
      byte_count: evidence.document.byte_count,
    },
    extraction: {
      completed: evidence.extraction.completed,
      engine: evidence.extraction.engine,
      page_count: evidence.extraction.page_count,
      character_count: evidence.extraction.character_count,
      text_sha256: evidence.extraction.text_sha256,
    },
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
      owner_decision_made: false,
      activation_allowed: false,
    },
    canon_claim_ceiling: CANON_CLAIM_CEILING,
  });
}

// ---------------------------------------------------------------- command

/**
 * Runs one pinned launch through the same admission and emits one closed receipt.
 *
 * The receipt is the only output and it goes to stderr, so stdout stays exactly
 * empty and cannot become a data channel a caller pipes somewhere. The returned
 * receipt is the emitted receipt: one that could not be written is not returned
 * as if it had been.
 */
export async function runProjectPdfAdmissionCli(argv, io = {}) {
  const streams = snapshotIo(io);
  if (streams === null) {
    // The handed io is refused, so the refusal is reported on this module's own
    // default sink rather than through the surface that was just rejected.
    return emitReceipt(defaultStreams(), commandReceipt(freshEvidence(), "io_invalid"));
  }
  const parsed = parseCommandArgs(snapshotArgv(argv));
  if (parsed === null) {
    return emitReceipt(streams, commandReceipt(freshEvidence(), "arguments_invalid"));
  }
  const outcome = await admitOnce(parsed.launchPath, parsed.expectedLaunchSha256);
  return emitReceipt(streams, commandReceipt(outcome.evidence, outcome.refusal));
}

// Closed own-data io. Two ordinary sinks, each with one own data write function:
// no descriptor, no path, no end or flush hook and no other stream capability can
// be reached through the io this command is handed. An empty io takes the process
// streams, and stdout is validated but never written.
function snapshotIo(io) {
  try {
    if (!ordinaryDataObject(io)) return null;
    const keys = Reflect.ownKeys(io);
    if (keys.length === 0) return defaultStreams();
    if (keys.length !== IO_KEYS.length) return null;
    const streams = {};
    for (const key of IO_KEYS) {
      if (!keys.includes(key)) return null;
      const descriptor = Object.getOwnPropertyDescriptor(io, key);
      if (descriptor === undefined || !Object.hasOwn(descriptor, "value")) return null;
      const write = ownDataWrite(descriptor.value);
      if (write === null) return null;
      streams[key] = descriptor.value;
      streams[`${key}Write`] = write;
    }
    return streams;
  } catch {
    return null;
  }
}

function ownDataWrite(stream) {
  if (!ordinaryDataObject(stream)) return null;
  const descriptor = Object.getOwnPropertyDescriptor(stream, "write");
  if (descriptor === undefined || !Object.hasOwn(descriptor, "value")) return null;
  const write = descriptor.value;
  if (typeof write !== "function" || types.isProxy(write)) return null;
  return write;
}

function defaultStreams() {
  return {
    stdout: process.stdout,
    stdoutWrite: process.stdout.write,
    stderr: process.stderr,
    stderrWrite: process.stderr.write,
  };
}

// Exactly four own string tokens on an ordinary array. A proxy, an exotic index,
// an accessor or a length that does not agree loses before any value is read.
function snapshotArgv(argv) {
  try {
    if (argv === null || typeof argv !== "object" || types.isProxy(argv)) return null;
    if (!Array.isArray(argv) || Object.getPrototypeOf(argv) !== Array.prototype) return null;
    const keys = Reflect.ownKeys(argv);
    if (keys.length !== ARGV_LENGTH + 1 || keys[ARGV_LENGTH] !== "length") return null;
    const length = Object.getOwnPropertyDescriptor(argv, "length");
    if (length === undefined || !Object.hasOwn(length, "value")
        || length.value !== ARGV_LENGTH) return null;
    const snapshot = [];
    for (let index = 0; index < ARGV_LENGTH; index += 1) {
      if (keys[index] !== String(index)) return null;
      const descriptor = Object.getOwnPropertyDescriptor(argv, index);
      if (descriptor === undefined || !Object.hasOwn(descriptor, "value")
          || typeof descriptor.value !== "string") return null;
      snapshot.push(descriptor.value);
    }
    return snapshot;
  } catch {
    return null;
  }
}

// Each flag once, each with one value, and nothing else. The launch path and the
// pin must hold their own shape here, so no other named token can be passed.
function parseCommandArgs(snapshot) {
  if (snapshot === null) return null;
  const parsed = new Map();
  for (let index = 0; index < snapshot.length; index += 2) {
    const flag = snapshot[index];
    const value = snapshot[index + 1];
    if (!ALLOWED_FLAGS.has(flag) || parsed.has(flag)
        || value.length === 0 || value.startsWith("--")) return null;
    parsed.set(flag, value);
  }
  if (!REQUIRED_FLAGS.every((flag) => parsed.has(flag))) return null;
  const launchPath = parsed.get("--launch");
  const expectedLaunchSha256 = parsed.get("--launch-sha256");
  if (refusedAbsoluteFilePath(launchPath) || !SHA256_HEX.test(expectedLaunchSha256)) return null;
  return { launchPath, expectedLaunchSha256 };
}

// One write, to stderr, of the serialised receipt. stdout is never written. A
// receipt that cannot be serialised falls back to the fixed receipt failure, and
// a receipt that cannot be emitted at all raises the payload free refusal instead
// of being returned as if it had been emitted.
async function emitReceipt(streams, receipt) {
  let emitted = receipt;
  let line;
  try {
    line = `${JSON.stringify(receipt)}\n`;
  } catch {
    emitted = commandReceipt(freshEvidence(), "receipt_failed");
    try {
      line = `${JSON.stringify(emitted)}\n`;
    } catch {
      throw admissionError("receipt_failed");
    }
  }
  let answer;
  try {
    answer = Reflect.apply(streams.stderrWrite, streams.stderr, [line]);
  } catch {
    throw admissionError("receipt_failed");
  }
  // The write itself is still the one synchronous call above. A sink that
  // answers with a promise or a thenable has emitted nothing until that single
  // answer settles, so the answer is adopted here rather than dropped: a
  // rejection, a throwing `then` or a late refusal becomes the same payload free
  // receipt failure, and a fulfilled answer settles before the receipt is
  // returned. Nothing is retried, no second receipt is built and no reason,
  // marker or cause from the sink is carried out.
  try {
    await answer;
  } catch {
    throw admissionError("receipt_failed");
  }
  return emitted;
}

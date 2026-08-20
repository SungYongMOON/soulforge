// Bounded P4 Preparation Module.
// Prepares one closed, canonical authority packet v0 between launch authoring/admission
// and the existing runner.
//
// Metadata-only: inspects launch, containment, project root, all locator ancestors,
// source leaf metadata, and output root. Body reads stay strictly zero.
import { execFile } from "node:child_process";
import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readSync,
  readdirSync,
  realpathSync,
} from "node:fs";
import { isAbsolute, join, relative, sep } from "node:path";
import process from "node:process";
import { promisify } from "node:util";

import { inspectIdentifierOpacity } from "../engineering_engine/kernel/identity.mjs";
import { comparablePathIdentity } from "../shared/physical_path_identity.mjs";
import { inspectPinnedProjectPdfAdmissionLaunch } from "./project_pdf_admission.mjs";
import {
  AUTHORITY_REF_IDENTITY_FIELDS,
  CANDIDATE_FILENAME,
  EXACT_REF_FIELDS,
  MAX_DOCUMENT_BYTES,
  MAX_LAUNCH_BYTES,
  PREPARATION_REQUEST_FIELDS,
  PROJECT_PDF_KNOWLEDGE_PILOT_PREPARATION_RECEIPT_SCHEMA_VERSION,
  PROJECT_PDF_KNOWLEDGE_PILOT_PREPARATION_REQUEST_SCHEMA_VERSION,
  RECEIPT_FILENAME,
  RESERVED_FLOATING_REVISION,
  SAFE_IDENTIFIER,
  SHA256_CONTENT_ID,
  SHA256_HEX,
  authorityOff,
  buildCanonicalAuthorityPacket,
  canonicalBytes,
  canonicalUtc,
  deepFreeze,
  ordinaryDataObject,
  safeAbsolutePath,
  sameRef,
  sha256Hex,
  snapshotOwnDataObject,
  validExactRef,
  validateAuthorityPacket,
} from "./project_pdf_knowledge_pilot_packet_contract.mjs";

const execFileAsync = promisify(execFile);

const FEATURE_STATE = "off";
const UTF8 = new TextDecoder("utf-8", { fatal: true });

const O_NOFOLLOW = typeof constants.O_NOFOLLOW === "number" ? constants.O_NOFOLLOW : 0;
const SAFE_READ_OPEN_FLAGS = constants.O_RDONLY | O_NOFOLLOW;
const SAFE_OPEN_AVAILABLE = process.platform === "win32" || O_NOFOLLOW !== 0;

const BLOCKERS = Object.freeze({
  request_invalid: ["PROJECT_PDF_KNOWLEDGE_PILOT_PREPARATION_REQUEST_INVALID", "request"],
  authority_refused: ["PROJECT_PDF_KNOWLEDGE_PILOT_PREPARATION_AUTHORITY_REFUSED", "authority"],
  authority_expired: ["PROJECT_PDF_KNOWLEDGE_PILOT_PREPARATION_AUTHORITY_EXPIRED", "authority"],
  launch_unreadable: ["PROJECT_PDF_KNOWLEDGE_PILOT_PREPARATION_LAUNCH_UNREADABLE", "launch"],
  launch_pin_refused: ["PROJECT_PDF_KNOWLEDGE_PILOT_PREPARATION_LAUNCH_PIN_REFUSED", "launch"],
  launch_parse_refused: ["PROJECT_PDF_KNOWLEDGE_PILOT_PREPARATION_LAUNCH_PARSE_REFUSED", "launch"],
  launch_contract_refused: ["PROJECT_PDF_KNOWLEDGE_PILOT_PREPARATION_LAUNCH_CONTRACT_REFUSED", "launch"],
  launch_binding_refused: ["PROJECT_PDF_KNOWLEDGE_PILOT_PREPARATION_LAUNCH_BINDING_REFUSED", "launch"],
  knowledge_view_refused: ["PROJECT_PDF_KNOWLEDGE_PILOT_PREPARATION_KNOWLEDGE_VIEW_REFUSED", "knowledge_view"],
  containment_root_refused: ["PROJECT_PDF_KNOWLEDGE_PILOT_PREPARATION_CONTAINMENT_ROOT_REFUSED", "containment_root"],
  project_root_refused: ["PROJECT_PDF_KNOWLEDGE_PILOT_PREPARATION_PROJECT_ROOT_REFUSED", "project_root"],
  locator_refused: ["PROJECT_PDF_KNOWLEDGE_PILOT_PREPARATION_LOCATOR_REFUSED", "locator"],
  ancestor_refused: ["PROJECT_PDF_KNOWLEDGE_PILOT_PREPARATION_ANCESTOR_REFUSED", "ancestor"],
  source_leaf_refused: ["PROJECT_PDF_KNOWLEDGE_PILOT_PREPARATION_SOURCE_LEAF_REFUSED", "source_leaf"],
  output_root_refused: ["PROJECT_PDF_KNOWLEDGE_PILOT_PREPARATION_OUTPUT_ROOT_REFUSED", "output_root"],
  output_root_nonempty: ["PROJECT_PDF_KNOWLEDGE_PILOT_PREPARATION_OUTPUT_ROOT_NONEMPTY", "output_root"],
  reparse_refused: ["PROJECT_PDF_KNOWLEDGE_PILOT_PREPARATION_REPARSE_REFUSED", "reparse"],
  internal_refused: ["PROJECT_PDF_KNOWLEDGE_PILOT_PREPARATION_INTERNAL_HOLD", "internal"],
});

class PreparationRefusal extends Error {
  constructor(key) {
    super(key);
    this.key = key;
  }
}

function refuse(key) {
  throw new PreparationRefusal(key);
}

const DEFAULT_OPERATIONS = Object.freeze({
  queryReparsePoint: defaultQueryReparsePoint,
  inspectLaunch: (request) => inspectPinnedProjectPdfAdmissionLaunch(request),
  now: () => Date.now(),
});

function initialState() {
  return {
    launchReads: 0,
    requestVerified: false,
    launchPinVerified: false,
    launchContractVerified: false,
    launchBindingVerified: false,
    authorityExpiryVerified: false,
    containmentRootVerified: false,
    projectRootVerified: false,
    locatorAncestorsVerified: false,
    sourceLeafMetadataVerified: false,
    outputRootVerified: false,
    reparseFreeVerified: false,
    canonicalPacketVerified: false,
  };
}

/**
 * Prepares one canonical Project PDF Knowledge Pilot authority packet v0.
 *
 * @param {object} request Closed preparation request binding external authority, launch pin, source refs, output root.
 * @param {object} [operations] Optional internal operations for deterministic testing.
 * @returns {Promise<{packetBytes: Buffer|null, packetSha256: string|null, receipt: object}>}
 */
export async function prepareProjectPdfKnowledgePilot(request, operations = DEFAULT_OPERATIONS) {
  const ops = { ...DEFAULT_OPERATIONS, ...(operations ?? {}) };
  const state = initialState();

  try {
    const preparedRequest = prepareRequest(request, ops.now());
    state.requestVerified = true;
    state.authorityExpiryVerified = true;

    // Check reparse on launch path
    const launchReparse = await ops.queryReparsePoint(preparedRequest.launchPath);
    if (launchReparse !== null) refuse("reparse_refused");

    // Stable-read launch file
    const launchRead = stableReadFile(preparedRequest.launchPath, MAX_LAUNCH_BYTES);
    state.launchReads += 1;
    if (launchRead === null) refuse("launch_unreadable");

    if (launchRead.bytes.byteLength !== preparedRequest.expectedLaunchByteCount
        || sha256Hex(launchRead.bytes) !== preparedRequest.expectedLaunchSha256) {
      refuse("launch_pin_refused");
    }
    state.launchPinVerified = true;

    // Authentic launch admission inspection
    let inspection;
    try {
      state.launchReads += 1;
      inspection = ops.inspectLaunch({
        launchPath: preparedRequest.launchPath,
        expectedLaunchSha256: preparedRequest.expectedLaunchSha256,
      });
    } catch {
      refuse("launch_contract_refused");
    }

    if (!ordinaryDataObject(inspection)
        || inspection.schema_version !== "soulforge.project_pdf_admission_launch_inspection.v0"
        || inspection.status !== "inspected"
        || inspection.launch_sha256 !== preparedRequest.expectedLaunchSha256
        || inspection.launch_byte_count !== preparedRequest.expectedLaunchByteCount) {
      refuse("launch_contract_refused");
    }
    state.launchContractVerified = true;

    // Compare authentic inspection refs to the snapshotted request
    if (!sameRef(inspection.project_binding_ref, preparedRequest.projectBindingRef)
        || !sameRef(inspection.document_revision_ref, preparedRequest.documentRevisionRef)) {
      refuse("launch_binding_refused");
    }
    state.launchBindingVerified = true;

    // Preparation separately parses the same pinned bytes only to derive containment/project/locator
    const launch = parseLaunchDocument(launchRead.bytes);
    const authorityGrant = launch?.project_knowledge_view_authority_grant;
    const readGrant = launch?.document_read_grant;
    if (!ordinaryDataObject(authorityGrant) || !ordinaryDataObject(readGrant)
        || typeof authorityGrant.containment_root_path !== "string"
        || typeof authorityGrant.project_root_path !== "string"
        || typeof readGrant.relative_locator !== "string") {
      refuse("launch_contract_refused");
    }

    // Verify containment root
    const containmentPath = authorityGrant.containment_root_path;
    await verifyDirectoryDirect(containmentPath, "containment_root_refused", ops.queryReparsePoint);
    state.containmentRootVerified = true;

    // Verify project root
    const projectPath = authorityGrant.project_root_path;
    await verifyProjectRootDirect(containmentPath, projectPath, ops.queryReparsePoint);
    state.projectRootVerified = true;

    // Verify relative locator segments and ancestors
    const locator = readGrant.relative_locator;
    const locatorSegments = validateRelativeLocatorSegments(locator);
    if (locatorSegments === null) refuse("locator_refused");

    // Ancestor directories along locator
    let ancestorCursor = projectPath;
    for (let index = 0; index < locatorSegments.length - 1; index += 1) {
      ancestorCursor = join(ancestorCursor, locatorSegments[index]);
      await verifyDirectoryDirect(ancestorCursor, "ancestor_refused", ops.queryReparsePoint);
    }
    state.locatorAncestorsVerified = true;

    // Source leaf file (METADATA ONLY - NO BODY READ)
    const sourceLeafPath = join(projectPath, ...locatorSegments);
    await verifySourceLeafMetadata(sourceLeafPath, ops.queryReparsePoint);
    state.sourceLeafMetadataVerified = true;

    // Output root directory (direct, empty)
    await verifyOutputRootDirect(preparedRequest.outputRootPath, ops.queryReparsePoint);
    state.outputRootVerified = true;
    state.reparseFreeVerified = true;

    // Build canonical authority packet v0
    const packet = buildCanonicalAuthorityPacket({
      authorityRefIdentity: preparedRequest.authorityRefIdentity,
      expiresAtUtc: preparedRequest.expiresAtUtc,
      launch: {
        absolutePath: preparedRequest.launchPath,
        sha256: preparedRequest.expectedLaunchSha256,
        byteCount: preparedRequest.expectedLaunchByteCount,
      },
      sourceBinding: {
        projectBindingRef: preparedRequest.projectBindingRef,
        documentRevisionRef: preparedRequest.documentRevisionRef,
        trustedSourceReceiptSha256: preparedRequest.trustedSourceRevisionReceiptSha256,
      },
      output: {
        absoluteRootPath: preparedRequest.outputRootPath,
        candidateFilename: CANDIDATE_FILENAME,
        receiptFilename: RECEIPT_FILENAME,
      },
    });

    const validatedPacket = validateAuthorityPacket(packet);
    if (validatedPacket === null) refuse("internal_refused");
    state.canonicalPacketVerified = true;

    const packetBytes = canonicalBytes(packet);
    const packetSha256 = sha256Hex(packetBytes);

    return Object.freeze({
      packetBytes,
      packetSha256,
      receipt: commandReceipt(state, null),
    });
  } catch (error) {
    const key = error instanceof PreparationRefusal && Object.hasOwn(BLOCKERS, error.key)
      ? error.key
      : "internal_refused";
    return Object.freeze({
      packetBytes: null,
      packetSha256: null,
      receipt: commandReceipt(state, key),
    });
  }
}

function prepareRequest(value, nowMs) {
  const snapshot = snapshotOwnDataObject(value, PREPARATION_REQUEST_FIELDS);
  if (snapshot === null) refuse("request_invalid");

  if (snapshot.schema_version !== PROJECT_PDF_KNOWLEDGE_PILOT_PREPARATION_REQUEST_SCHEMA_VERSION) {
    refuse("request_invalid");
  }

  const authIdentitySnapshot = snapshotOwnDataObject(
    snapshot.authority_ref_identity,
    AUTHORITY_REF_IDENTITY_FIELDS,
  );
  if (authIdentitySnapshot === null || !validateAuthorityIdentity(authIdentitySnapshot)) {
    refuse("authority_refused");
  }

  const expiresAtUtc = snapshot.expires_at_utc;
  if (typeof expiresAtUtc !== "string" || !canonicalUtc(expiresAtUtc)) refuse("request_invalid");
  if (Date.parse(expiresAtUtc) <= nowMs) refuse("authority_expired");

  const launchPath = snapshot.launch_path;
  if (typeof launchPath !== "string" || !safeAbsolutePath(launchPath)) refuse("request_invalid");

  const expectedLaunchSha256 = snapshot.expected_launch_sha256;
  if (typeof expectedLaunchSha256 !== "string" || !SHA256_HEX.test(expectedLaunchSha256)) {
    refuse("request_invalid");
  }

  const expectedLaunchByteCount = snapshot.expected_launch_byte_count;
  if (!Number.isSafeInteger(expectedLaunchByteCount) || expectedLaunchByteCount < 1
      || expectedLaunchByteCount > MAX_LAUNCH_BYTES) {
    refuse("request_invalid");
  }

  const projectBindingRefSnapshot = snapshotOwnDataObject(
    snapshot.project_binding_ref,
    EXACT_REF_FIELDS,
  );
  if (projectBindingRefSnapshot === null || !validExactRef(projectBindingRefSnapshot)) {
    refuse("request_invalid");
  }

  const documentRevisionRefSnapshot = snapshotOwnDataObject(
    snapshot.document_revision_ref,
    EXACT_REF_FIELDS,
  );
  if (documentRevisionRefSnapshot === null || !validExactRef(documentRevisionRefSnapshot)) {
    refuse("request_invalid");
  }

  const trustedSourceRevisionReceiptSha256 = snapshot.trusted_source_revision_receipt_sha256;
  if (typeof trustedSourceRevisionReceiptSha256 !== "string"
      || !SHA256_CONTENT_ID.test(trustedSourceRevisionReceiptSha256)) {
    refuse("request_invalid");
  }

  const outputRootPath = snapshot.output_root_path;
  if (typeof outputRootPath !== "string" || !safeAbsolutePath(outputRootPath)) {
    refuse("request_invalid");
  }

  return {
    authorityRefIdentity: {
      entity_id: authIdentitySnapshot.entity_id,
      revision_id: authIdentitySnapshot.revision_id,
      content_hash_alg: "sha256",
    },
    expiresAtUtc,
    launchPath,
    expectedLaunchSha256,
    expectedLaunchByteCount,
    projectBindingRef: {
      entity_id: projectBindingRefSnapshot.entity_id,
      revision_id: projectBindingRefSnapshot.revision_id,
      content_id: projectBindingRefSnapshot.content_id,
      content_hash_alg: "sha256",
    },
    documentRevisionRef: {
      entity_id: documentRevisionRefSnapshot.entity_id,
      revision_id: documentRevisionRefSnapshot.revision_id,
      content_id: documentRevisionRefSnapshot.content_id,
      content_hash_alg: "sha256",
    },
    trustedSourceRevisionReceiptSha256,
    outputRootPath,
  };
}

function validateAuthorityIdentity(identity) {
  if (!ordinaryDataObject(identity)
      || typeof identity.entity_id !== "string"
      || typeof identity.revision_id !== "string"
      || identity.content_hash_alg !== "sha256"
      || !SAFE_IDENTIFIER.test(identity.entity_id)
      || !SAFE_IDENTIFIER.test(identity.revision_id)
      || inspectIdentifierOpacity(identity.entity_id).opaque !== true
      || inspectIdentifierOpacity(identity.revision_id).opaque !== true
      || RESERVED_FLOATING_REVISION.test(identity.revision_id)) {
    return false;
  }
  return true;
}

function parseLaunchDocument(bytes) {
  let text;
  try {
    text = UTF8.decode(bytes);
  } catch {
    refuse("launch_parse_refused");
  }
  try {
    return JSON.parse(text);
  } catch {
    refuse("launch_parse_refused");
  }
}

async function verifyDirectoryDirect(dirPath, failureKey, queryReparsePoint) {
  if (!safeAbsolutePath(dirPath)) refuse(failureKey);
  try {
    const stat = lstatSync(dirPath, { bigint: true });
    if (!stat.isDirectory() || stat.isSymbolicLink()) refuse(failureKey);
    const real = realpathSync.native(dirPath);
    if (comparablePathIdentity(real) !== comparablePathIdentity(dirPath)) refuse(failureKey);
  } catch {
    refuse(failureKey);
  }
  const reparse = await queryReparsePoint(dirPath);
  if (reparse !== null) refuse("reparse_refused");
}

async function verifyProjectRootDirect(containmentRoot, projectRoot, queryReparsePoint) {
  await verifyDirectoryDirect(projectRoot, "project_root_refused", queryReparsePoint);

  const delta = relative(containmentRoot, projectRoot);
  if (delta === "" || delta.startsWith("..") || isAbsolute(delta)) {
    refuse("project_root_refused");
  }

  let cursor = containmentRoot;
  for (const segment of delta.split(sep)) {
    if (!segment) continue;
    cursor = join(cursor, segment);
    await verifyDirectoryDirect(cursor, "project_root_refused", queryReparsePoint);
  }
}

function validateRelativeLocatorSegments(locator) {
  if (typeof locator !== "string" || locator.length === 0 || locator.length > 1024
      || locator.normalize("NFC") !== locator
      || locator.startsWith("/") || locator.endsWith("/")
      || locator.includes("//") || locator.includes("\\")) {
    return null;
  }
  const segments = locator.split("/");
  if (segments.length === 0 || segments.length > 64) return null;
  for (const seg of segments) {
    if (!seg || seg.length > 255 || seg === "." || seg === ".."
        || /[\u0000-\u001f\u007f]/u.test(seg)
        || /[. ]$/u.test(seg)
        || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu.test(seg)) {
      return null;
    }
  }
  return segments;
}

async function verifySourceLeafMetadata(sourcePath, queryReparsePoint) {
  if (!safeAbsolutePath(sourcePath)) refuse("source_leaf_refused");
  let stat;
  try {
    stat = lstatSync(sourcePath, { bigint: true });
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1n) refuse("source_leaf_refused");
    if (stat.size < 0n || stat.size > BigInt(MAX_DOCUMENT_BYTES)) refuse("source_leaf_refused");
    const real = realpathSync.native(sourcePath);
    if (comparablePathIdentity(real) !== comparablePathIdentity(sourcePath)) refuse("source_leaf_refused");
  } catch {
    refuse("source_leaf_refused");
  }
  const reparse = await queryReparsePoint(sourcePath);
  if (reparse !== null) refuse("reparse_refused");
}

async function verifyOutputRootDirect(outputRoot, queryReparsePoint) {
  await verifyDirectoryDirect(outputRoot, "output_root_refused", queryReparsePoint);
  let entries;
  try {
    entries = readdirSync(outputRoot);
  } catch {
    refuse("output_root_refused");
  }
  if (entries.length !== 0) refuse("output_root_nonempty");
}

function stableReadFile(path, maxBytes) {
  if (!safeAbsolutePath(path) || !SAFE_OPEN_AVAILABLE) return null;
  let descriptor = null;
  try {
    const before = lstatSync(path, { bigint: true });
    if (!stableRegularFile(before, maxBytes)) return null;
    const beforeRealpath = realpathSync.native(path);
    descriptor = openSync(path, SAFE_READ_OPEN_FLAGS);
    const opened = fstatSync(descriptor, { bigint: true });
    if (!sameFileIdentity(before, opened) || !stableRegularFile(opened, maxBytes)) return null;
    const size = Number(opened.size);
    const bytes = Buffer.alloc(size);
    let offset = 0;
    while (offset < size) {
      const read = readSync(descriptor, bytes, offset, size - offset, offset);
      if (!Number.isSafeInteger(read) || read <= 0) return null;
      offset += read;
    }
    if (readSync(descriptor, Buffer.alloc(1), 0, 1, size) !== 0) return null;
    const after = lstatSync(path, { bigint: true });
    const afterRealpath = realpathSync.native(path);
    const closed = fstatSync(descriptor, { bigint: true });
    if (beforeRealpath !== afterRealpath
        || !sameFileIdentity(before, after)
        || !sameFileIdentity(opened, closed)
        || !stableRegularFile(after, maxBytes)) return null;
    return { bytes };
  } catch {
    return null;
  } finally {
    if (descriptor !== null) {
      try {
        closeSync(descriptor);
      } catch {
        // failed close
      }
    }
  }
}

function stableRegularFile(stat, maxBytes) {
  return stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1n
    && stat.size >= 0n && stat.size <= BigInt(maxBytes);
}

function sameFileIdentity(left, right) {
  return left.dev === right.dev
    && left.ino === right.ino
    && left.size === right.size
    && left.nlink === right.nlink
    && left.mtimeNs === right.mtimeNs
    && left.ctimeNs === right.ctimeNs;
}

export async function defaultQueryReparsePoint(filePath) {
  try {
    const stat = lstatSync(filePath);
    if (stat.isSymbolicLink()) return "symlink";
  } catch {
    return "stat_failed";
  }
  if (process.platform !== "win32") return null;
  try {
    const { stdout = "" } = await execFileAsync("fsutil.exe", ["reparsepoint", "query", filePath], {
      windowsHide: true,
      encoding: "utf8",
      maxBuffer: 1024 * 1024,
    });
    const match = String(stdout).match(/0x[0-9a-f]{8}(?![0-9a-f])/i);
    return match ? match[0].toLowerCase() : "reparse_point";
  } catch (error) {
    const combined = `${error?.stdout ?? ""} ${error?.stderr ?? ""}`;
    if (/\b4390\b|not a reparse point|재분석\s*지점이\s*아닙니다/iu.test(combined)) {
      return null;
    }
    return "query_failed";
  }
}

function commandReceipt(state, refusalKey) {
  const blocker = refusalKey === null ? null : BLOCKERS[refusalKey];
  return deepFreeze({
    schema_version: PROJECT_PDF_KNOWLEDGE_PILOT_PREPARATION_RECEIPT_SCHEMA_VERSION,
    kind: "project_pdf_knowledge_pilot_preparation_command_receipt",
    result: blocker === null ? "PASS" : "HOLD",
    feature_state: FEATURE_STATE,
    blocker_code: blocker === null ? null : blocker[0],
    blocker_stage: blocker === null ? null : blocker[1],
    verification: {
      request_verified: state.requestVerified,
      launch_pin_verified: state.launchPinVerified,
      launch_contract_verified: state.launchContractVerified,
      launch_binding_verified: state.launchBindingVerified,
      authority_expiry_verified: state.authorityExpiryVerified,
      containment_root_verified: state.containmentRootVerified,
      project_root_verified: state.projectRootVerified,
      locator_ancestors_verified: state.locatorAncestorsVerified,
      source_leaf_metadata_verified: state.sourceLeafMetadataVerified,
      output_root_verified: state.outputRootVerified,
      reparse_free_verified: state.reparseFreeVerified,
      canonical_packet_verified: state.canonicalPacketVerified,
    },
    authority: authorityOff(),
    effects: {
      launch_reads: state.launchReads,
      source_body_reads: 0,
      filesystem_writes: 0,
      network_calls: 0,
      model_calls: 0,
      persistent_rag_writes: 0,
      wiki_writes: 0,
      engine_calls: 0,
      erp_writes: 0,
      taskdriver_activations: 0,
      retrieval_operations: 0,
    },
  });
}

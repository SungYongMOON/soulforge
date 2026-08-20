// Bounded create-only P4 runner.  The Owner-authority packet is the closed
// request: it pins one launch, one source revision, one trusted projection
// digest, and one pre-existing empty output root.  This module never receives a
// body, query, locator, root override, writer hook, or retrieval surface from a
// caller.  It verifies those bindings before it invokes the admission seam once.
import { createHash } from "node:crypto";
import {
  closeSync,
  constants,
  fstatSync,
  fsyncSync,
  lstatSync,
  openSync,
  readSync,
  readdirSync,
  realpathSync,
  writeSync,
} from "node:fs";
import { isAbsolute, join, resolve, sep } from "node:path";
import process from "node:process";
import { types } from "node:util";

import { canonicalise, compareCodePoints } from "../engineering_engine/kernel/canonical.mjs";
import { inspectIdentifierOpacity, isWellFormedRef, sameExactRef } from "../engineering_engine/kernel/identity.mjs";
import { comparablePathIdentity } from "../shared/physical_path_identity.mjs";
import {
  extractAdmittedProjectPdfCandidate,
  inspectPinnedProjectPdfAdmissionLaunch,
} from "./project_pdf_admission.mjs";
import { buildProjectPdfKnowledgeCandidate } from "./project_pdf_knowledge_projection.mjs";

export const PROJECT_PDF_KNOWLEDGE_PILOT_COMMAND_RECEIPT_SCHEMA_VERSION =
  "soulforge.project_pdf_knowledge_pilot_command_receipt.v0";

const PACKET_SCHEMA_VERSION = "soulforge.project_pdf_knowledge_pilot_authority_packet.v0";
const RUN_AUTHORITY_SCHEMA_VERSION = "soulforge.project_pdf_knowledge_pilot_run_authority.v0";
const STORED_RECEIPT_SCHEMA_VERSION = "soulforge.project_pdf_knowledge_pilot_storage_receipt.v0";
const FEATURE_STATE = "off";
const CANDIDATE_FILENAME = "project_pdf_knowledge_candidate.json";
const RECEIPT_FILENAME = "project_pdf_knowledge_persistence_receipt.json";
const MAX_PACKET_BYTES = 512 * 1024;
const MAX_LAUNCH_BYTES = 2 * 1024 * 1024;
const MAX_OUTPUT_FILE_BYTES = 8 * 1024 * 1024;
const MAX_PATH_CHARS = 4096;
const SHA256_HEX = /^[0-9a-f]{64}$/u;
const SHA256_CONTENT_ID = /^sha256:[0-9a-f]{64}$/u;
const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/u;
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const CONTROL = /[\u0000-\u001f\u007f]/u;
const WINDOWS_UNC_OR_DEVICE_NAMESPACE = /^[\\/]{2}/u;
const WINDOWS_DRIVE_DESIGNATOR = /^[A-Za-z]:(?=[\\/]|$)/u;
const WINDOWS_DEVICE_NAME = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu;
const RESERVED_FLOATING_REVISION = /^(?:latest|current|head|tip|floating)$/iu;
const UTF8 = new TextDecoder("utf-8", { fatal: true });

const REQUEST_FIELDS = Object.freeze([
  "authorityPacketPath",
  "expectedAuthorityPacketSha256",
]);
const IO_KEYS = Object.freeze(["stdout", "stderr"]);
const PACKET_FIELDS = Object.freeze([
  "schema_version",
  "kind",
  "feature_state",
  "run_authority",
  "launch",
  "source_binding",
  "output",
]);
const RUN_AUTHORITY_FIELDS = Object.freeze([
  "schema_version",
  "kind",
  "feature_state",
  "purpose",
  "expires_at_utc",
  "attempt_limit",
  "consumption_state",
  "retry_allowed",
  "authority_ref",
  "authority_digest_sha256",
]);
const LAUNCH_FIELDS = Object.freeze(["absolute_path", "sha256", "byte_count"]);
const SOURCE_BINDING_FIELDS = Object.freeze([
  "project_binding_ref",
  "document_revision_ref",
  "trusted_source_revision_receipt_sha256",
]);
const OUTPUT_FIELDS = Object.freeze([
  "absolute_root_path",
  "root_commitment_sha256",
  "candidate_filename",
  "receipt_filename",
]);
const EXACT_REF_FIELDS = Object.freeze([
  "entity_id",
  "revision_id",
  "content_id",
  "content_hash_alg",
]);

const RUN_AUTHORITY_HASH_DOMAIN = "soulforge.project_pdf_knowledge_pilot.run_authority.v0";
const OUTPUT_ROOT_HASH_DOMAIN = "soulforge.project_pdf_knowledge_pilot.output_root.v0";
const CANDIDATE_HASH_DOMAIN = "soulforge.project_pdf_knowledge_candidate.v0";

const O_NOFOLLOW = typeof constants.O_NOFOLLOW === "number" ? constants.O_NOFOLLOW : 0;
const SAFE_READ_OPEN_FLAGS = constants.O_RDONLY | O_NOFOLLOW;
const SAFE_WRITE_OPEN_FLAGS =
  constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | O_NOFOLLOW;
const SAFE_OPEN_AVAILABLE = process.platform === "win32" || O_NOFOLLOW !== 0;

const BLOCKERS = Object.freeze({
  request_invalid: ["PROJECT_PDF_KNOWLEDGE_PILOT_REQUEST_INVALID", "request"],
  arguments_invalid: ["PROJECT_PDF_KNOWLEDGE_PILOT_ARGUMENTS_INVALID", "arguments"],
  io_invalid: ["PROJECT_PDF_KNOWLEDGE_PILOT_IO_INVALID", "io"],
  packet_unreadable: ["PROJECT_PDF_KNOWLEDGE_PILOT_AUTHORITY_PACKET_UNREADABLE", "authority_packet"],
  packet_pin_refused: ["PROJECT_PDF_KNOWLEDGE_PILOT_AUTHORITY_PACKET_PIN_REFUSED", "authority_packet"],
  packet_parse_refused: ["PROJECT_PDF_KNOWLEDGE_PILOT_AUTHORITY_PACKET_PARSE_REFUSED", "authority_packet"],
  packet_refused: ["PROJECT_PDF_KNOWLEDGE_PILOT_AUTHORITY_PACKET_REFUSED", "authority_packet"],
  run_authority_refused: ["PROJECT_PDF_KNOWLEDGE_PILOT_RUN_AUTHORITY_REFUSED", "run_authority"],
  run_authority_binding_refused: [
    "PROJECT_PDF_KNOWLEDGE_PILOT_RUN_AUTHORITY_BINDING_REFUSED",
    "run_authority",
  ],
  run_authority_expired: ["PROJECT_PDF_KNOWLEDGE_PILOT_RUN_AUTHORITY_EXPIRED", "run_authority"],
  run_authority_consumed: ["PROJECT_PDF_KNOWLEDGE_PILOT_RUN_AUTHORITY_CONSUMED", "run_authority"],
  output_refused: ["PROJECT_PDF_KNOWLEDGE_PILOT_OUTPUT_REFUSED", "output"],
  output_exists: ["PROJECT_PDF_KNOWLEDGE_PILOT_OUTPUT_EXISTS", "output"],
  output_postcondition_refused: [
    "PROJECT_PDF_KNOWLEDGE_PILOT_OUTPUT_POSTCONDITION_REFUSED",
    "output",
  ],
  launch_unreadable: ["PROJECT_PDF_KNOWLEDGE_PILOT_LAUNCH_UNREADABLE", "launch"],
  launch_pin_refused: ["PROJECT_PDF_KNOWLEDGE_PILOT_LAUNCH_PIN_REFUSED", "launch"],
  launch_binding_refused: ["PROJECT_PDF_KNOWLEDGE_PILOT_LAUNCH_BINDING_REFUSED", "launch"],
  admission_refused: ["PROJECT_PDF_KNOWLEDGE_PILOT_ADMISSION_REFUSED", "admission"],
  projection_refused: ["PROJECT_PDF_KNOWLEDGE_PILOT_PROJECTION_REFUSED", "projection"],
  candidate_refused: ["PROJECT_PDF_KNOWLEDGE_PILOT_CANDIDATE_REFUSED", "candidate"],
  candidate_write_refused: ["PROJECT_PDF_KNOWLEDGE_PILOT_CANDIDATE_WRITE_REFUSED", "candidate_write"],
  candidate_readback_refused: [
    "PROJECT_PDF_KNOWLEDGE_PILOT_CANDIDATE_READBACK_REFUSED",
    "candidate_readback",
  ],
  receipt_write_refused: ["PROJECT_PDF_KNOWLEDGE_PILOT_RECEIPT_WRITE_REFUSED", "receipt_write"],
  receipt_readback_refused: [
    "PROJECT_PDF_KNOWLEDGE_PILOT_RECEIPT_READBACK_REFUSED",
    "receipt_readback",
  ],
  internal_refused: ["PROJECT_PDF_KNOWLEDGE_PILOT_INTERNAL_HOLD", "internal"],
});

class RunnerRefusal extends Error {
  constructor(key) {
    super(key);
    this.key = key;
  }
}

const DEFAULT_OPERATIONS = Object.freeze({
  inspectLaunch,
  admit: extractAdmittedProjectPdfCandidate,
  project: buildProjectPdfKnowledgeCandidate,
});

function refuse(key) {
  throw new RunnerRefusal(key);
}

function initialState() {
  return {
    authorityPacketReads: 0,
    launchInspections: 0,
    admissionAttempts: 0,
    projectionBuilds: 0,
    outputFileCreations: 0,
    outputFileReadbacks: 0,
    authorityPacketPinVerified: false,
    runAuthorityBindingVerified: false,
    runAuthorityExpiryVerified: false,
    runAuthorityOneAttemptPacketVerified: false,
    launchPinVerified: false,
    launchBindingVerified: false,
    admissionExecutedOnce: false,
    projectionBuiltOnce: false,
    sourceRevisionTrusted: false,
    candidateBodyFreeVerified: false,
    candidateFileReadbackVerified: false,
    receiptFileReadbackVerified: false,
    candidate: null,
    receiptFile: null,
  };
}

/**
 * Runs one authority-pinned P4 candidate persistence attempt.
 *
 * The only public request is a path to the closed authority packet plus the
 * raw-byte SHA-256 pin for that packet.  All project, launch, output and source
 * bindings live inside that packet and must validate before the one admission
 * call can start.
 */
export async function runProjectPdfKnowledgePilot(request) {
  return runProjectPdfKnowledgePilotWithOperations(request, DEFAULT_OPERATIONS);
}

async function runProjectPdfKnowledgePilotWithOperations(request, operations) {
  const state = initialState();
  try {
    const preparedRequest = prepareRequest(request);
    const packetRead = stableReadFile(preparedRequest.authorityPacketPath, MAX_PACKET_BYTES);
    state.authorityPacketReads += 1;
    if (packetRead === null) refuse("packet_unreadable");
    if (sha256Hex(packetRead.bytes) !== preparedRequest.expectedAuthorityPacketSha256) {
      refuse("packet_pin_refused");
    }
    state.authorityPacketPinVerified = true;

    const packet = parsePacketBytes(packetRead.bytes);
    const preparedPacket = validateAuthorityPacket(packet);
    state.runAuthorityBindingVerified = true;
    state.runAuthorityExpiryVerified = true;
    state.runAuthorityOneAttemptPacketVerified = true;

    const output = preflightOutput(preparedPacket.output);
    if (output === null) refuse("output_refused");
    if (output.nonempty) refuse("output_exists");

    const inspection = operations.inspectLaunch(preparedPacket.launch);
    state.launchInspections += 1;
    if (inspection === null) refuse("launch_unreadable");
    if (inspection.launch_sha256 !== preparedPacket.launch.sha256
        || inspection.launch_byte_count !== preparedPacket.launch.byteCount) {
      refuse("launch_pin_refused");
    }
    state.launchPinVerified = true;
    if (!sameRef(inspection.project_binding_ref, preparedPacket.sourceBinding.projectRef)
        || !sameRef(inspection.document_revision_ref, preparedPacket.sourceBinding.documentRef)) {
      refuse("launch_binding_refused");
    }
    state.launchBindingVerified = true;

    let admitted;
    try {
      state.admissionAttempts += 1;
      admitted = await operations.admit({
        launchPath: preparedPacket.launch.absolutePath,
        expectedLaunchSha256: preparedPacket.launch.sha256,
      });
    } catch {
      refuse("admission_refused");
    }
    state.admissionExecutedOnce = true;

    let projection;
    try {
      state.projectionBuilds += 1;
      projection = operations.project({
        admitted_candidate: admitted,
        expected_project_binding_ref: preparedPacket.sourceBinding.projectRef,
        expected_document_revision_ref: preparedPacket.sourceBinding.documentRef,
        trusted_source_revision_receipt_sha256: preparedPacket.sourceBinding.trustedSourceReceiptSha256,
      });
    } catch {
      refuse("projection_refused");
    } finally {
      // The admitted object can contain source text.  No reference to it crosses
      // the persistence seam after this one pure projection call.
      admitted = null;
    }
    state.projectionBuiltOnce = true;
    if (projection === null || projection.candidate === null
        || projection.receipt?.status !== "candidate_built") {
      refuse("projection_refused");
    }

    const candidate = projection.candidate;
    if (!bodyFreeCandidate(candidate)
        || !sameRef(candidate.project_binding_ref, preparedPacket.sourceBinding.projectRef)
        || !sameRef(candidate.document_revision_ref, preparedPacket.sourceBinding.documentRef)
        || candidate.source_revision_receipt?.source_revision_receipt_sha256
          !== preparedPacket.sourceBinding.trustedSourceReceiptSha256
        || candidate.candidate_sha256 !== recomputeCandidateDigest(candidate)) {
      refuse("candidate_refused");
    }
    state.sourceRevisionTrusted = true;
    state.candidateBodyFreeVerified = true;

    const candidateBytes = canonicalBytes(candidate);
    if (candidateBytes.byteLength > MAX_OUTPUT_FILE_BYTES) refuse("candidate_refused");
    const candidateFileSha256 = "sha256:" + sha256Hex(candidateBytes);
    const candidateWrite = createOnlyFile(output, output.candidatePath, candidateBytes, []);
    state.outputFileCreations += candidateWrite.created ? 1 : 0;
    if (!candidateWrite.complete) refuse("candidate_write_refused");

    state.outputFileReadbacks += 1;
    if (!verifyCandidateReadback(
      output.candidatePath,
      candidateBytes,
      candidateFileSha256,
      candidate.candidate_sha256,
    )) {
      refuse("candidate_readback_refused");
    }
    state.candidateFileReadbackVerified = true;
    state.candidate = {
      logicalCandidateSha256: candidate.candidate_sha256,
      fileSha256: candidateFileSha256,
      fileByteCount: candidateBytes.byteLength,
    };

    const storedReceipt = buildStoredReceipt(state, candidate);
    const receiptBytes = canonicalBytes(storedReceipt);
    if (receiptBytes.byteLength > MAX_OUTPUT_FILE_BYTES) refuse("receipt_write_refused");
    const receiptFileSha256 = "sha256:" + sha256Hex(receiptBytes);
    const receiptWrite = createOnlyFile(
      output,
      output.receiptPath,
      receiptBytes,
      [output.candidateFilename],
    );
    state.outputFileCreations += receiptWrite.created ? 1 : 0;
    if (!receiptWrite.complete) refuse("receipt_write_refused");

    state.outputFileReadbacks += 1;
    if (!verifyExactReadback(output.receiptPath, receiptBytes, receiptFileSha256)) {
      refuse("receipt_readback_refused");
    }
    state.receiptFileReadbackVerified = true;
    if (!exactOutputPostcondition(output)) refuse("output_postcondition_refused");
    state.receiptFile = {
      fileSha256: receiptFileSha256,
      fileByteCount: receiptBytes.byteLength,
    };
    return commandReceipt(state, null);
  } catch (error) {
    const key = error instanceof RunnerRefusal && Object.hasOwn(BLOCKERS, error.key)
      ? error.key
      : "internal_refused";
    return commandReceipt(state, key);
  }
}

/**
 * Strict stderr-only command surface for the runner.
 */
export async function runProjectPdfKnowledgePilotCli(argv, io = {}) {
  return runProjectPdfKnowledgePilotCliWithRunner(
    argv,
    io,
    (request) => runProjectPdfKnowledgePilot(request),
  );
}

async function runProjectPdfKnowledgePilotCliWithRunner(argv, io, run) {
  const streams = snapshotIo(io);
  if (streams === null) {
    const receipt = commandReceipt(initialState(), "io_invalid");
    try {
      return await emitReceipt(defaultStreams(), receipt);
    } catch {
      return receipt;
    }
  }
  const request = parseCliRequest(argv);
  const receipt = request === null
    ? commandReceipt(initialState(), "arguments_invalid")
    : await run(request);
  try {
    return await emitReceipt(streams, receipt);
  } catch {
    return commandReceipt(initialState(), "io_invalid");
  }
}

function prepareRequest(value) {
  const snapshot = snapshotOwnDataObject(value, REQUEST_FIELDS);
  if (snapshot === null || typeof snapshot.authorityPacketPath !== "string"
      || !safeAbsolutePath(snapshot.authorityPacketPath)
      || typeof snapshot.expectedAuthorityPacketSha256 !== "string"
      || !SHA256_HEX.test(snapshot.expectedAuthorityPacketSha256)) {
    refuse("request_invalid");
  }
  return {
    authorityPacketPath: snapshot.authorityPacketPath,
    expectedAuthorityPacketSha256: snapshot.expectedAuthorityPacketSha256,
  };
}

function parsePacketBytes(bytes) {
  let text;
  try {
    text = UTF8.decode(bytes);
  } catch {
    refuse("packet_parse_refused");
  }
  try {
    return JSON.parse(text);
  } catch {
    refuse("packet_parse_refused");
  }
}

function validateAuthorityPacket(packet) {
  if (!ordinaryDataObject(packet) || !exactKeys(packet, PACKET_FIELDS)
      || packet.schema_version !== PACKET_SCHEMA_VERSION
      || packet.kind !== "project_pdf_knowledge_pilot_authority_packet"
      || packet.feature_state !== FEATURE_STATE) {
    refuse("packet_refused");
  }
  validateRunAuthorityShape(packet.run_authority);
  const launch = validateLaunch(packet.launch);
  const sourceBinding = validateSourceBinding(packet.source_binding);
  const output = validateOutput(packet.output);
  validateRunAuthorityBinding(packet);
  return { launch, sourceBinding, output };
}

function validateRunAuthorityShape(authority) {
  if (!ordinaryDataObject(authority) || !exactKeys(authority, RUN_AUTHORITY_FIELDS)
      || authority.schema_version !== RUN_AUTHORITY_SCHEMA_VERSION
      || authority.kind !== "project_pdf_knowledge_pilot_run_authority"
      || authority.feature_state !== FEATURE_STATE
      || authority.purpose !== "one_admitted_pdf_knowledge_candidate_persist"
      || authority.attempt_limit !== 1
      || authority.retry_allowed !== false
      || !validExactRef(authority.authority_ref)
      || typeof authority.authority_digest_sha256 !== "string"
      || !SHA256_CONTENT_ID.test(authority.authority_digest_sha256)
      || !canonicalUtc(authority.expires_at_utc)) {
    refuse("run_authority_refused");
  }
  if (authority.consumption_state !== "unconsumed" && authority.consumption_state !== "consumed") {
    refuse("run_authority_refused");
  }
}

function validateRunAuthorityBinding(packet) {
  const authority = packet.run_authority;
  const expectedDigest = canonicalFingerprint(
    RUN_AUTHORITY_HASH_DOMAIN,
    runAuthorityBindingMaterial(packet),
  );
  if (expectedDigest === null
      || authority.authority_digest_sha256 !== expectedDigest
      || authority.authority_ref.content_id !== expectedDigest) {
    refuse("run_authority_binding_refused");
  }
  if (authority.consumption_state === "consumed") refuse("run_authority_consumed");
  if (Date.parse(authority.expires_at_utc) <= Date.now()) refuse("run_authority_expired");
}

function runAuthorityBindingMaterial(packet) {
  const authority = packet.run_authority;
  return {
    schema_version: packet.schema_version,
    kind: packet.kind,
    feature_state: packet.feature_state,
    run_authority: {
      schema_version: authority.schema_version,
      kind: authority.kind,
      feature_state: authority.feature_state,
      purpose: authority.purpose,
      expires_at_utc: authority.expires_at_utc,
      attempt_limit: authority.attempt_limit,
      consumption_state: authority.consumption_state,
      retry_allowed: authority.retry_allowed,
      authority_ref_identity: {
        entity_id: authority.authority_ref.entity_id,
        revision_id: authority.authority_ref.revision_id,
        content_hash_alg: authority.authority_ref.content_hash_alg,
      },
    },
    launch: {
      absolute_path: packet.launch.absolute_path,
      sha256: packet.launch.sha256,
      byte_count: packet.launch.byte_count,
    },
    source_binding: {
      project_binding_ref: cloneRef(packet.source_binding.project_binding_ref),
      document_revision_ref: cloneRef(packet.source_binding.document_revision_ref),
      trusted_source_revision_receipt_sha256:
        packet.source_binding.trusted_source_revision_receipt_sha256,
    },
    output: {
      absolute_root_path: packet.output.absolute_root_path,
      root_commitment_sha256: packet.output.root_commitment_sha256,
      candidate_filename: packet.output.candidate_filename,
      receipt_filename: packet.output.receipt_filename,
    },
  };
}

function validateLaunch(launch) {
  if (!ordinaryDataObject(launch) || !exactKeys(launch, LAUNCH_FIELDS)
      || typeof launch.absolute_path !== "string" || !safeAbsolutePath(launch.absolute_path)
      || typeof launch.sha256 !== "string" || !SHA256_HEX.test(launch.sha256)
      || !Number.isSafeInteger(launch.byte_count) || launch.byte_count < 1
      || launch.byte_count > MAX_LAUNCH_BYTES) {
    refuse("packet_refused");
  }
  return {
    absolutePath: launch.absolute_path,
    sha256: launch.sha256,
    byteCount: launch.byte_count,
  };
}

function validateSourceBinding(binding) {
  if (!ordinaryDataObject(binding) || !exactKeys(binding, SOURCE_BINDING_FIELDS)
      || !validExactRef(binding.project_binding_ref)
      || !validExactRef(binding.document_revision_ref)
      || typeof binding.trusted_source_revision_receipt_sha256 !== "string"
      || !SHA256_CONTENT_ID.test(binding.trusted_source_revision_receipt_sha256)) {
    refuse("packet_refused");
  }
  return {
    projectRef: cloneRef(binding.project_binding_ref),
    documentRef: cloneRef(binding.document_revision_ref),
    trustedSourceReceiptSha256: binding.trusted_source_revision_receipt_sha256,
  };
}

function validateOutput(output) {
  if (!ordinaryDataObject(output) || !exactKeys(output, OUTPUT_FIELDS)
      || typeof output.absolute_root_path !== "string" || !safeAbsolutePath(output.absolute_root_path)
      || typeof output.root_commitment_sha256 !== "string"
      || !SHA256_CONTENT_ID.test(output.root_commitment_sha256)
      || output.candidate_filename !== CANDIDATE_FILENAME
      || output.receipt_filename !== RECEIPT_FILENAME) {
    refuse("output_refused");
  }
  const expectedCommitment = canonicalFingerprint(OUTPUT_ROOT_HASH_DOMAIN, {
    absolute_root_path: output.absolute_root_path,
  });
  if (expectedCommitment === null || expectedCommitment !== output.root_commitment_sha256) {
    refuse("output_refused");
  }
  return {
    absoluteRootPath: output.absolute_root_path,
    candidateFilename: output.candidate_filename,
    receiptFilename: output.receipt_filename,
  };
}

function preflightOutput(output) {
  if (!safeAbsolutePath(output.absoluteRootPath) || !SAFE_OPEN_AVAILABLE) return null;
  let rootStat;
  let rootRealpath;
  try {
    rootStat = lstatSync(output.absoluteRootPath, { bigint: true });
    if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) return null;
    rootRealpath = realpathSync.native(output.absoluteRootPath);
    if (comparablePathIdentity(rootRealpath)
        !== comparablePathIdentity(output.absoluteRootPath)) return null;
    const entries = readdirSync(output.absoluteRootPath);
    const candidatePath = boundedOutputPath(output.absoluteRootPath, output.candidateFilename);
    const receiptPath = boundedOutputPath(output.absoluteRootPath, output.receiptFilename);
    if (candidatePath === null || receiptPath === null || candidatePath === receiptPath) return null;
    return {
      nonempty: entries.length !== 0,
      rootPath: output.absoluteRootPath,
      rootComparablePath: comparablePathIdentity(rootRealpath),
      rootDevice: rootStat.dev,
      rootInode: rootStat.ino,
      candidateFilename: output.candidateFilename,
      receiptFilename: output.receiptFilename,
      candidatePath,
      receiptPath,
    };
  } catch {
    return null;
  }
}

function inspectLaunch(launch) {
  try {
    return inspectPinnedProjectPdfAdmissionLaunch({
      launchPath: launch.absolutePath,
      expectedLaunchSha256: launch.sha256,
    });
  } catch {
    return null;
  }
}

function createOnlyFile(output, path, bytes, expectedEntries) {
  let descriptor = null;
  let created = false;
  try {
    if (!exactOutputEntries(output, expectedEntries)) return { created, complete: false };
    descriptor = openSync(path, SAFE_WRITE_OPEN_FLAGS, 0o600);
    created = true;
    let offset = 0;
    while (offset < bytes.byteLength) {
      const written = writeSync(descriptor, bytes, offset, bytes.byteLength - offset, offset);
      if (!Number.isSafeInteger(written) || written <= 0) return { created, complete: false };
      offset += written;
    }
    fsyncSync(descriptor);
    return { created, complete: true };
  } catch {
    return { created, complete: false };
  } finally {
    if (descriptor !== null) {
      try {
        closeSync(descriptor);
      } catch {
        // The create-only result already holds; no cleanup or retry is allowed.
      }
    }
  }
}

function sameOutputRoot(output) {
  try {
    const stat = lstatSync(output.rootPath, { bigint: true });
    return stat.isDirectory() && !stat.isSymbolicLink()
      && stat.dev === output.rootDevice
      && stat.ino === output.rootInode
      && comparablePathIdentity(realpathSync.native(output.rootPath))
        === output.rootComparablePath;
  } catch {
    return false;
  }
}

function exactOutputPostcondition(output) {
  return exactOutputEntries(output, [output.candidateFilename, output.receiptFilename]);
}

function exactOutputEntries(output, expected) {
  if (!sameOutputRoot(output)) return false;
  try {
    const actual = readdirSync(output.rootPath).sort(compareCodePoints);
    const required = [...expected].sort(compareCodePoints);
    return actual.length === required.length
      && actual.every((entry, index) => entry === required[index]);
  } catch {
    return false;
  }
}

function verifyCandidateReadback(path, expectedBytes, expectedFileSha256, expectedCandidateSha256) {
  const read = stableReadFile(path, MAX_OUTPUT_FILE_BYTES);
  if (read === null || read.bytes.byteLength !== expectedBytes.byteLength
      || "sha256:" + sha256Hex(read.bytes) !== expectedFileSha256
      || !read.bytes.equals(expectedBytes)) return false;
  try {
    const candidate = JSON.parse(UTF8.decode(read.bytes));
    return bodyFreeCandidate(candidate)
      && candidate.candidate_sha256 === expectedCandidateSha256
      && recomputeCandidateDigest(candidate) === expectedCandidateSha256;
  } catch {
    return false;
  }
}

function verifyExactReadback(path, expectedBytes, expectedFileSha256) {
  const read = stableReadFile(path, MAX_OUTPUT_FILE_BYTES);
  return read !== null
    && read.bytes.byteLength === expectedBytes.byteLength
    && "sha256:" + sha256Hex(read.bytes) === expectedFileSha256
    && read.bytes.equals(expectedBytes);
}

function buildStoredReceipt(state, candidate) {
  return deepFreeze({
    schema_version: STORED_RECEIPT_SCHEMA_VERSION,
    kind: "project_pdf_knowledge_pilot_storage_receipt",
    status: "candidate_persisted_receipt_unverified",
    feature_state: FEATURE_STATE,
    receipt_file_self_verification: "not_claimed",
    candidate: {
      logical_candidate_sha256: state.candidate.logicalCandidateSha256,
      file_sha256: state.candidate.fileSha256,
      file_byte_count: state.candidate.fileByteCount,
      source_revision_receipt_sha256:
        candidate.source_revision_receipt.source_revision_receipt_sha256,
    },
    verification: {
      authority_packet_pin_verified: true,
      run_authority_binding_verified: true,
      run_authority_expiry_verified: true,
      one_attempt_packet_verified: true,
      durable_consumption_verified: false,
      launch_pin_verified: true,
      launch_binding_verified: true,
      admission_executed_once: true,
      projection_built_once: true,
      trusted_source_receipt_verified: true,
      body_free_candidate_verified: true,
      candidate_file_readback_verified: true,
    },
    counts: {
      source_count: 1,
      project_count: 1,
      retrieval_unit_count: candidate.rag_candidate.retrieval_units.length,
      thin_wiki_page_count: candidate.thin_wiki_candidate.page_count,
    },
    authority: authorityOff(),
    effects: {
      filesystem_file_creations: 1,
      persistent_rag_writes: 0,
      wiki_writes: 0,
      network_calls: 0,
      model_calls: 0,
      engine_calls: 0,
      erp_writes: 0,
      taskdriver_activations: 0,
      retrieval_operations: 0,
    },
  });
}

function commandReceipt(state, refusalKey) {
  const blocker = refusalKey === null ? null : BLOCKERS[refusalKey];
  return deepFreeze({
    schema_version: PROJECT_PDF_KNOWLEDGE_PILOT_COMMAND_RECEIPT_SCHEMA_VERSION,
    kind: "project_pdf_knowledge_pilot_command_receipt",
    result: blocker === null ? "PASS" : "HOLD",
    feature_state: FEATURE_STATE,
    blocker_code: blocker === null ? null : blocker[0],
    blocker_stage: blocker === null ? null : blocker[1],
    verification: {
      authority_packet_pin_verified: state.authorityPacketPinVerified,
      run_authority_binding_verified: state.runAuthorityBindingVerified,
      run_authority_expiry_verified: state.runAuthorityExpiryVerified,
      one_attempt_packet_verified: state.runAuthorityOneAttemptPacketVerified,
      durable_consumption_verified: false,
      launch_pin_verified: state.launchPinVerified,
      launch_binding_verified: state.launchBindingVerified,
      admission_executed_once: state.admissionExecutedOnce,
      projection_built_once: state.projectionBuiltOnce,
      trusted_source_receipt_verified: state.sourceRevisionTrusted,
      body_free_candidate_verified: state.candidateBodyFreeVerified,
      candidate_file_readback_verified: state.candidateFileReadbackVerified,
      receipt_file_readback_verified: state.receiptFileReadbackVerified,
    },
    candidate: {
      logical_candidate_sha256: state.candidate?.logicalCandidateSha256 ?? null,
      file_sha256: state.candidate?.fileSha256 ?? null,
      file_byte_count: state.candidate?.fileByteCount ?? null,
    },
    receipt_file: {
      file_sha256: state.receiptFile?.fileSha256 ?? null,
      file_byte_count: state.receiptFile?.fileByteCount ?? null,
    },
    effects: {
      authority_packet_reads: state.authorityPacketReads,
      launch_inspections: state.launchInspections,
      admission_attempts: state.admissionAttempts,
      projection_builds: state.projectionBuilds,
      output_file_creations: state.outputFileCreations,
      output_file_readbacks: state.outputFileReadbacks,
      persistent_rag_writes: 0,
      wiki_writes: 0,
      network_calls: 0,
      model_calls: 0,
      engine_calls: 0,
      erp_writes: 0,
      taskdriver_activations: 0,
      retrieval_operations: 0,
    },
  });
}

function authorityOff() {
  return {
    source_truth: false,
    canon: false,
    project_state: false,
    owner_identity_verified: false,
    owner_approval_verified: false,
    accepted_context: false,
    persistent_write_allowed: false,
    activation_allowed: false,
    engine_input_allowed: false,
    erp_write_allowed: false,
    taskdriver_allowed: false,
  };
}

function bodyFreeCandidate(candidate) {
  if (!ordinaryDataObject(candidate) || typeof candidate.candidate_sha256 !== "string"
      || !SHA256_CONTENT_ID.test(candidate.candidate_sha256)) return false;
  const forbidden = new Set([
    "text", "body", "raw_query", "query", "path", "absolute_path", "relative_locator",
    "launch_path", "document_path", "root_path", "pages_text", "excerpt",
  ]);
  const pending = [candidate];
  while (pending.length > 0) {
    const current = pending.pop();
    if (current === null || typeof current !== "object") continue;
    if (Array.isArray(current)) {
      for (const item of current) pending.push(item);
      continue;
    }
    for (const [key, value] of Object.entries(current)) {
      if (forbidden.has(key)) return false;
      pending.push(value);
    }
  }
  return true;
}

function recomputeCandidateDigest(candidate) {
  if (!ordinaryDataObject(candidate) || !Object.hasOwn(candidate, "candidate_sha256")) return null;
  const material = {};
  for (const [key, value] of Object.entries(candidate)) {
    if (key !== "candidate_sha256") material[key] = value;
  }
  return canonicalFingerprint(CANDIDATE_HASH_DOMAIN, material);
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
        // A failed stable read is indistinguishable from any other unreadable file.
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

function boundedOutputPath(root, filename) {
  if (filename !== CANDIDATE_FILENAME && filename !== RECEIPT_FILENAME) return null;
  const path = join(root, filename);
  return path.startsWith(root + sep) ? path : null;
}

function safeAbsolutePath(value) {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_PATH_CHARS
      || value.normalize("NFC") !== value || CONTROL.test(value)
      || !isAbsolute(value) || resolve(value) !== value
      || WINDOWS_UNC_OR_DEVICE_NAMESPACE.test(value)) return false;
  const colonStart = WINDOWS_DRIVE_DESIGNATOR.test(value) ? 2 : 0;
  if (value.includes(":", colonStart)) return false;
  if (process.platform !== "win32") return true;
  return !value.split(/[\\/]/u).filter(Boolean).some((segment) => WINDOWS_DEVICE_NAME.test(segment)
    || /[. ]$/u.test(segment));
}

function canonicalUtc(value) {
  if (typeof value !== "string" || !ISO_UTC.test(value)) return false;
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) && new Date(milliseconds).toISOString() === value;
}

function validExactRef(ref) {
  if (!ordinaryDataObject(ref) || !exactKeys(ref, EXACT_REF_FIELDS)
      || typeof ref.entity_id !== "string" || typeof ref.revision_id !== "string"
      || !SAFE_IDENTIFIER.test(ref.entity_id) || !SAFE_IDENTIFIER.test(ref.revision_id)
      || inspectIdentifierOpacity(ref.entity_id).opaque !== true
      || inspectIdentifierOpacity(ref.revision_id).opaque !== true
      || RESERVED_FLOATING_REVISION.test(ref.revision_id)
      || ref.content_hash_alg !== "sha256"
      || typeof ref.content_id !== "string" || !SHA256_CONTENT_ID.test(ref.content_id)) {
    return false;
  }
  try {
    return isWellFormedRef(ref);
  } catch {
    return false;
  }
}

function sameRef(left, right) {
  try {
    return sameExactRef(left, right);
  } catch {
    return false;
  }
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
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function ordinaryDataObject(value) {
  try {
    return value !== null && typeof value === "object" && !types.isProxy(value) && !Array.isArray(value)
      && Object.getPrototypeOf(value) === Object.prototype;
  } catch {
    return false;
  }
}

function snapshotOwnDataObject(value, expected) {
  try {
    if (!ordinaryDataObject(value)) return null;
    const keys = Reflect.ownKeys(value);
    if (keys.length !== expected.length || keys.some((key) => typeof key !== "string")) return null;
    const expectedKeys = [...expected].sort(compareCodePoints);
    const actualKeys = keys.sort(compareCodePoints);
    if (actualKeys.some((key, index) => key !== expectedKeys[index])) return null;
    const snapshot = {};
    for (const key of expected) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor === undefined || !Object.hasOwn(descriptor, "value")
          || descriptor.enumerable !== true) return null;
      snapshot[key] = descriptor.value;
    }
    return snapshot;
  } catch {
    return null;
  }
}

function exactKeys(value, expected) {
  if (!ordinaryDataObject(value)) return false;
  const actual = Object.keys(value).sort(compareCodePoints);
  const required = [...expected].sort(compareCodePoints);
  return actual.length === required.length
    && actual.every((key, index) => key === required[index]);
}

function insertionOrderRules(value) {
  const rules = {};
  const visit = (node, path = "") => {
    if (Array.isArray(node)) {
      rules[path] = "insertion_ordered";
      for (const child of node) visit(child, path + "[]");
    } else if (node !== null && typeof node === "object") {
      for (const [key, child] of Object.entries(node)) visit(
        child,
        path ? path + "." + key : key,
      );
    }
  };
  visit(value);
  return rules;
}

function canonicalFingerprint(domain, material) {
  try {
    return "sha256:" + sha256Hex(domain + "\0" + canonicalise(material, insertionOrderRules(material)));
  } catch {
    return null;
  }
}

function canonicalBytes(value) {
  return Buffer.from(canonicalise(value, insertionOrderRules(value)) + "\n", "utf8");
}

function sha256Hex(value) {
  return createHash("sha256").update(value).digest("hex");
}

function parseCliRequest(argv) {
  const snapshot = snapshotArgv(argv);
  if (snapshot === null || snapshot[0] !== "--authority-packet"
      || snapshot[2] !== "--authority-packet-sha256") return null;
  const request = {
    authorityPacketPath: snapshot[1],
    expectedAuthorityPacketSha256: snapshot[3],
  };
  try {
    return prepareRequest(request);
  } catch {
    return null;
  }
}

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
      streams[key + "Write"] = write;
    }
    return streams;
  } catch {
    return null;
  }
}

function ownDataWrite(stream) {
  if (!ordinaryDataObject(stream)) return null;
  const descriptor = Object.getOwnPropertyDescriptor(stream, "write");
  if (descriptor === undefined || !Object.hasOwn(descriptor, "value")
      || typeof descriptor.value !== "function" || types.isProxy(descriptor.value)) return null;
  return descriptor.value;
}

function defaultStreams() {
  return {
    stdout: process.stdout,
    stdoutWrite: process.stdout.write,
    stderr: process.stderr,
    stderrWrite: process.stderr.write,
  };
}

function snapshotArgv(argv) {
  try {
    if (argv === null || typeof argv !== "object" || types.isProxy(argv)
        || !Array.isArray(argv) || Object.getPrototypeOf(argv) !== Array.prototype) return null;
    const keys = Reflect.ownKeys(argv);
    if (keys.length !== 5 || keys[4] !== "length") return null;
    const length = Object.getOwnPropertyDescriptor(argv, "length");
    if (length === undefined || !Object.hasOwn(length, "value") || length.value !== 4) return null;
    const snapshot = [];
    for (let index = 0; index < 4; index += 1) {
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

async function emitReceipt(streams, receipt) {
  const text = JSON.stringify(receipt) + "\n";
  const result = Reflect.apply(streams.stderrWrite, streams.stderr, [text]);
  await result;
  return receipt;
}

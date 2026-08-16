// Project document ingest seam. It turns one pinned pdf byte stream into one
// closed, deep frozen candidate. The bytes stay in memory, the extraction unit
// is fixed, and the result claims no authority and leaves nothing behind.
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { types } from "node:util";

// The only extraction unit this seam may ever start.
const WORKER_REF = "guild_hall/rag/project_document_extract.py";
const VENV_REF = "guild_hall/state/tools/source_extraction_venv";
const REQUEST_KEYS = ["pdfBytes", "expectedSha256"];
const MAX_INPUT_BYTES = 16 * 1024 * 1024;
const MAX_WORKER_OUTPUT_BYTES = 8 * 1024 * 1024;
const WORKER_TIMEOUT_MS = 30 * 1000;
// Page, per page and aggregate caps stay in step with the extraction unit so a
// reported document can never grow past a few megabytes while it is validated.
const MAX_WORKER_PAGES = 2048;
const MAX_WORKER_PAGE_CHARACTERS = 512 * 1024;
const MAX_WORKER_TEXT_CHARACTERS = 1024 * 1024;
const MAX_WORKER_TEXT_BYTES = 2 * 1024 * 1024;

const CANDIDATE_SCHEMA_VERSION = "soulforge.project_document_ingest_candidate.v0";
const CANDIDATE_MEDIA_TYPE = "application/pdf";
const EXTRACTION_ENGINE = "pymupdf";
const SHA256_HEX_PATTERN = /^[0-9a-f]{64}$/u;

// Trusted typed array intrinsics. Accepted bytes are identified, measured and
// copied only through these, so a shadowed own property, a hooked iterator or an
// exotic prototype can never run caller code or steer the snapshot.
const TYPED_ARRAY_PROTOTYPE = Object.getPrototypeOf(Uint8Array.prototype);
const TYPED_ARRAY_NAME_OF = Object.getOwnPropertyDescriptor(
  TYPED_ARRAY_PROTOTYPE,
  Symbol.toStringTag,
).get;
const BYTE_LENGTH_OF = Object.getOwnPropertyDescriptor(
  TYPED_ARRAY_PROTOTYPE,
  "byteLength",
).get;
const COPY_BYTES_INTO = Uint8Array.prototype.set;
const BYTE_VIEW_SHADOW_KEYS = [
  "buffer",
  "byteLength",
  "byteOffset",
  "length",
  Symbol.iterator,
  Symbol.toPrimitive,
];

const ERROR_NAME = "ProjectDocumentIngestError";
const ERROR_MESSAGES = Object.freeze({
  request_invalid: "project document ingest request is invalid",
  input_bytes_too_large: "project document ingest input exceeds the byte cap",
  input_digest_mismatch: "project document ingest input digest does not match the expected pin",
  pdf_unreadable: "project document ingest input is not a readable pdf",
});

// Both runtime refs are derived from this module location alone.
const REPO_ROOT_URL = new URL("../../", import.meta.url);
const WORKER_PATH = fileURLToPath(new URL(WORKER_REF, REPO_ROOT_URL));
const VENV_PYTHON_PATH = fileURLToPath(new URL(
  process.platform === "win32" ? `${VENV_REF}/Scripts/python.exe` : `${VENV_REF}/bin/python`,
  REPO_ROOT_URL,
));

class ProjectDocumentIngestError extends Error {
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

function ingestError(code) {
  return new ProjectDocumentIngestError(code);
}

export async function extractProjectPdfCandidate(request) {
  const prepared = prepareRequest(request);
  const rawOutput = await runWorker(prepared.snapshot);
  const pages = readWorkerPages(rawOutput);
  if (pages === null) throw ingestError("pdf_unreadable");
  return buildCandidate(prepared, pages);
}

// Closed own-data request, hard cap, then pin. Everything here runs before the
// first await so the caller keeps full ownership of its own buffer afterwards.
function prepareRequest(request) {
  if (request === null || typeof request !== "object") throw ingestError("request_invalid");
  // A proxy answers every later reflection with caller code, so the root is
  // refused before the first trap capable read.
  if (types.isProxy(request)) throw ingestError("request_invalid");
  const rootPrototype = Object.getPrototypeOf(request);
  if (rootPrototype !== Object.prototype && rootPrototype !== null) {
    throw ingestError("request_invalid");
  }
  if (Reflect.ownKeys(request).length !== REQUEST_KEYS.length) {
    throw ingestError("request_invalid");
  }
  const [pdfBytes, expectedSha256] = REQUEST_KEYS.map((key) => readOwnDataValue(request, key));
  if (typeof expectedSha256 !== "string" || !SHA256_HEX_PATTERN.test(expectedSha256)) {
    throw ingestError("request_invalid");
  }
  const byteLength = readAcceptedByteLength(pdfBytes);
  if (byteLength === 0) throw ingestError("request_invalid");
  if (byteLength > MAX_INPUT_BYTES) throw ingestError("input_bytes_too_large");
  const snapshot = Buffer.allocUnsafe(byteLength);
  COPY_BYTES_INTO.call(snapshot, pdfBytes);
  const sha256 = createHash("sha256").update(snapshot).digest("hex");
  if (sha256 !== expectedSha256) throw ingestError("input_digest_mismatch");
  return { snapshot, sha256 };
}

function readOwnDataValue(request, key) {
  const descriptor = Object.getOwnPropertyDescriptor(request, key);
  if (!descriptor || !("value" in descriptor)) throw ingestError("request_invalid");
  return descriptor.value;
}

// Exact byte view acceptance. Only an ordinary Buffer or Uint8Array view passes:
// a proxy loses first, the internal slot name and the prototype are pinned, own
// slot shadows and hooks are refused without being invoked, and the length comes
// from the internal slot instead of a reachable property.
function readAcceptedByteLength(pdfBytes) {
  if (pdfBytes === null || typeof pdfBytes !== "object") throw ingestError("request_invalid");
  if (types.isProxy(pdfBytes)) throw ingestError("request_invalid");
  if (TYPED_ARRAY_NAME_OF.call(pdfBytes) !== "Uint8Array") throw ingestError("request_invalid");
  const bytesPrototype = Object.getPrototypeOf(pdfBytes);
  if (bytesPrototype !== Buffer.prototype && bytesPrototype !== Uint8Array.prototype) {
    throw ingestError("request_invalid");
  }
  for (const key of BYTE_VIEW_SHADOW_KEYS) {
    if (Object.getOwnPropertyDescriptor(pdfBytes, key) !== undefined) {
      throw ingestError("request_invalid");
    }
  }
  return BYTE_LENGTH_OF.call(pdfBytes);
}

// One direct start of the fixed unit: bytes in over stdin, bounded json out over
// stdout, diagnostics dropped, hard timeout and hard output cap. The isolated
// no bytecode flags keep the repo venv runtime free of ambient interpreter
// configuration and leave nothing written beside the unit.
function runWorker(snapshot) {
  return new Promise((resolve) => {
    const chunks = [];
    let outputBytes = 0;
    let settled = false;
    let timer = null;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      if (timer !== null) clearTimeout(timer);
      resolve(value);
    };

    let child = null;
    try {
      child = spawn(VENV_PYTHON_PATH, ["-I", "-B", WORKER_PATH], {
        stdio: ["pipe", "pipe", "ignore"],
        windowsHide: true,
      });
    } catch {
      resolve(null);
      return;
    }

    timer = setTimeout(() => {
      child.kill();
      finish(null);
    }, WORKER_TIMEOUT_MS);
    if (typeof timer.unref === "function") timer.unref();

    child.on("error", () => finish(null));
    child.stdin.on("error", () => {});
    child.stdout.on("data", (chunk) => {
      outputBytes += chunk.length;
      if (outputBytes > MAX_WORKER_OUTPUT_BYTES) {
        child.kill();
        finish(null);
        return;
      }
      chunks.push(chunk);
    });
    child.on("close", () => finish(Buffer.concat(chunks)));
    child.stdin.end(snapshot);
  });
}

// Reported stdout is untrusted, so malformed bytes must fail the decode instead
// of turning into replacement characters that could still parse.
const WORKER_OUTPUT_DECODER = new TextDecoder("utf-8", { fatal: true });

// Closed bounded validation of the reported shape. Anything else is unreadable.
function readWorkerPages(rawOutput) {
  if (!Buffer.isBuffer(rawOutput)) return null;
  if (rawOutput.byteLength === 0 || rawOutput.byteLength > MAX_WORKER_OUTPUT_BYTES) return null;
  let report = null;
  try {
    const decoded = WORKER_OUTPUT_DECODER.decode(rawOutput);
    report = JSON.parse(decoded);
  } catch {
    return null;
  }
  if (report === null || typeof report !== "object" || Array.isArray(report)) return null;
  if (Reflect.ownKeys(report).length !== 4) return null;
  if (report.status !== "extracted" || report.engine !== EXTRACTION_ENGINE) return null;
  if (!Number.isSafeInteger(report.page_count)) return null;
  if (report.page_count < 1 || report.page_count > MAX_WORKER_PAGES) return null;
  if (!Array.isArray(report.pages) || report.pages.length !== report.page_count) return null;
  const pages = [];
  let totalCharacters = 0;
  let totalBytes = 0;
  for (let index = 0; index < report.pages.length; index += 1) {
    const page = report.pages[index];
    if (page === null || typeof page !== "object" || Array.isArray(page)) return null;
    if (Reflect.ownKeys(page).length !== 2) return null;
    if (page.page_number !== index + 1) return null;
    if (typeof page.text !== "string") return null;
    if (page.text.length > MAX_WORKER_PAGE_CHARACTERS) return null;
    totalCharacters += page.text.length;
    if (totalCharacters > MAX_WORKER_TEXT_CHARACTERS) return null;
    totalBytes += Buffer.byteLength(page.text, "utf8");
    if (totalBytes > MAX_WORKER_TEXT_BYTES) return null;
    pages.push({ page_number: page.page_number, text: page.text });
  }
  return pages;
}

function buildCandidate({ snapshot, sha256 }, pages) {
  const text = pages.map((page) => page.text).join("");
  return deepFreeze({
    schema_version: CANDIDATE_SCHEMA_VERSION,
    status: "candidate",
    source: {
      media_type: CANDIDATE_MEDIA_TYPE,
      sha256,
      byte_count: snapshot.byteLength,
    },
    extraction: {
      engine: EXTRACTION_ENGINE,
      page_count: pages.length,
      character_count: text.length,
      text_sha256: createHash("sha256").update(text, "utf8").digest("hex"),
      pages,
    },
    authority: {
      source_truth: false,
      canon: false,
      project_state: false,
      approval: false,
    },
    effects: {
      persistent_writes: 0,
      network_calls: 0,
      model_calls: 0,
      rag_index_writes: 0,
      wiki_writes: 0,
    },
  });
}

function deepFreeze(value) {
  if (value === null || typeof value !== "object") return value;
  for (const key of Object.keys(value)) deepFreeze(value[key]);
  return Object.freeze(value);
}

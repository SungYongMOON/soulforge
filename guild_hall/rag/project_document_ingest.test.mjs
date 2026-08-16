import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

import { extractProjectPdfCandidate } from "./project_document_ingest.mjs";

// Public synthetic one-page PDF produced by PyMuPDF. No project payload, no private source.
const FIXTURE_BASE64 =
  "JVBERi0xLjcKJcK1wrYKJSBXcml0dGVuIGJ5IE11UERGIDEuMjcuMgoKMSAwIG9iago8PC9UeXBlL0NhdGFsb2cvUGFnZXMgMiAwIFIvSW5mbzw8L1Byb2R1Y2VyKE11UERGIDEuMjcuMik+Pj4+CmVuZG9iagoKMiAwIG9iago8PC9UeXBlL1BhZ2VzL0NvdW50IDEvS2lkc1s0IDAgUl0+PgplbmRvYmoKCjMgMCBvYmoKPDwvRm9udDw8L2hlbHYgNSAwIFI+Pj4+CmVuZG9iagoKNCAwIG9iago8PC9UeXBlL1BhZ2UvTWVkaWFCb3hbMCAwIDMwMCAyMDBdL1JvdGF0ZSAwL1Jlc291cmNlcyAzIDAgUi9QYXJlbnQgMiAwIFIvQ29udGVudHNbNiAwIFJdPj4KZW5kb2JqCgo1IDAgb2JqCjw8L1R5cGUvRm9udC9TdWJ0eXBlL1R5cGUxL0Jhc2VGb250L0hlbHZldGljYS9FbmNvZGluZy9XaW5BbnNpRW5jb2Rpbmc+PgplbmRvYmoKCjYgMCBvYmoKPDwvTGVuZ3RoIDk5L0ZpbHRlci9GbGF0ZURlY29kZT4+CnN0cmVhbQp42h2KMQrDQAwEe71CP7Ckk/ZcBBeBNOkC6oKrw4cLu0jj9+cwWwwzLP3omaQsY8oFrDZznjTt23GxKmfn7yMKeg00YNBQESYh7g6T6qMoCqKaCez+tWG+rPmmV9KH/oHxFqwKZW5kc3RyZWFtCmVuZG9iagoKeHJlZgowIDcKMDAwMDAwMDAwMCA2NTUzNSBmIAowMDAwMDAwMDQyIDAwMDAwIG4gCjAwMDAwMDAxMjAgMDAwMDAgbiAKMDAwMDAwMDE3MiAwMDAwMCBuIAowMDAwMDAwMjEzIDAwMDAwIG4gCjAwMDAwMDAzMjAgMDAwMDAgbiAKMDAwMDAwMDQwOSAwMDAwMCBuIAoKdHJhaWxlcgo8PC9TaXplIDcvUm9vdCAxIDAgUi9JRFs8MTdDM0FDQzI5MDY4QzI5MjU2QzM4NzdFMTRDMzhGQzM+PDhEOENBRUNDNzNGREU3MkRGNDc5NzBGQzM0NUQ3ODNFPl0+PgpzdGFydHhyZWYKNTc2CiUlRU9GCg==";
const FIXTURE_BYTE_COUNT = 850;
const FIXTURE_PDF_SHA256 = "dabb2b0ac21c6506a621f3bfe6d0685e7e3eda2886f205c4ef066c7f656326a3";
const FIXTURE_TEXT = "Soulforge PDF tracer bullet\n";
const FIXTURE_CHARACTER_COUNT = 28;
const FIXTURE_TEXT_SHA256 = "3dceeabc3c008cd7e7700aa1414a0b522cdd091d8f5618b625e0bbbfe7347b86";

// The only worker this seam may ever reference.
const WORKER_REF = "guild_hall/rag/project_document_extract.py";
const VENV_REF = "guild_hall/state/tools/source_extraction_venv";
const MAX_INPUT_BYTES = 16 * 1024 * 1024;

const ERROR_NAME = "ProjectDocumentIngestError";
const REQUEST_INVALID = Object.freeze({
  code: "request_invalid",
  message: "project document ingest request is invalid",
});
const INPUT_BYTES_TOO_LARGE = Object.freeze({
  code: "input_bytes_too_large",
  message: "project document ingest input exceeds the byte cap",
});
const INPUT_DIGEST_MISMATCH = Object.freeze({
  code: "input_digest_mismatch",
  message: "project document ingest input digest does not match the expected pin",
});
const PDF_UNREADABLE = Object.freeze({
  code: "pdf_unreadable",
  message: "project document ingest input is not a readable pdf",
});

const ALLOWED_ERROR_PROPERTIES = new Set(["code", "message", "name", "stack"]);
const WRONG_WELL_FORMED_PIN = "0".repeat(64);
const NEAR_MISS_PIN = `${FIXTURE_PDF_SHA256.slice(0, 63)}0`;

// Any request key other than the two accepted ones must be refused, including the
// path, project id, url, env override, callback, provider, and writer surfaces.
const FORBIDDEN_REQUEST_FIELDS = [
  "projectId",
  "project_id",
  "sourcePath",
  "path",
  "url",
  "repoRoot",
  "workerRef",
  "pythonPath",
  "env",
  "timeoutMs",
  "signal",
  "onProgress",
  "provider",
  "writer",
  "metadata",
  "persist",
];

function freshFixtureBytes() {
  return Buffer.from(FIXTURE_BASE64, "base64");
}

function sha256Hex(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function expectedCandidate() {
  return {
    schema_version: "soulforge.project_document_ingest_candidate.v0",
    status: "candidate",
    source: {
      media_type: "application/pdf",
      sha256: FIXTURE_PDF_SHA256,
      byte_count: FIXTURE_BYTE_COUNT,
    },
    extraction: {
      engine: "pymupdf",
      page_count: 1,
      character_count: FIXTURE_CHARACTER_COUNT,
      text_sha256: FIXTURE_TEXT_SHA256,
      pages: [{ page_number: 1, text: FIXTURE_TEXT }],
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
  };
}

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

function assertPayloadFreeError(error, expected) {
  assert.ok(error instanceof Error, "must reject with an Error");
  assert.equal(error.name, ERROR_NAME);
  assert.equal(error.code, expected.code);
  assert.equal(error.message, expected.message);
  for (const property of Object.getOwnPropertyNames(error)) {
    assert.equal(
      ALLOWED_ERROR_PROPERTIES.has(property),
      true,
      `error must not expose ${property}`,
    );
  }
  const exposed = JSON.stringify({
    code: error.code,
    message: error.message,
    enumerable: { ...error },
  });
  const forbiddenFragments = [
    FIXTURE_BASE64.slice(0, 32),
    "%PDF",
    FIXTURE_TEXT.trim(),
    FIXTURE_PDF_SHA256,
    FIXTURE_TEXT_SHA256,
    WRONG_WELL_FORMED_PIN,
    WORKER_REF,
    VENV_REF,
    "python",
    "fitz",
    "stdout",
    "stderr",
    "Traceback",
  ];
  for (const fragment of forbiddenFragments) {
    assert.equal(
      exposed.includes(fragment),
      false,
      `error must not expose ${fragment.slice(0, 16)}`,
    );
  }
  assert.equal(/[\\/]/u.test(error.message), false, "error message must carry no path");
  return true;
}

async function assertRejectsWith(request, expected) {
  await assert.rejects(
    async () => extractProjectPdfCandidate(request),
    (error) => assertPayloadFreeError(error, expected),
  );
}

// Reflection surfaces a refusal may never reach. Running even one of these hands
// control to caller supplied code before the request has been accepted.
const PROXY_TRAPS = [
  "getPrototypeOf",
  "setPrototypeOf",
  "isExtensible",
  "preventExtensions",
  "getOwnPropertyDescriptor",
  "defineProperty",
  "has",
  "get",
  "set",
  "deleteProperty",
  "ownKeys",
];

function createTrapProbe(target) {
  const calls = [];
  const handler = {};
  for (const trap of PROXY_TRAPS) {
    handler[trap] = () => {
      calls.push(trap);
      throw new Error(`proxy trap ${trap} must never run`);
    };
  }
  return { proxy: new Proxy(target, handler), calls };
}

async function assertRejectsUntouched(request, expected, probes) {
  await assert.rejects(
    async () => extractProjectPdfCandidate(request),
    (error) => {
      assert.equal(error instanceof TypeError, false, "no raw TypedArray TypeError may escape");
      return assertPayloadFreeError(error, expected);
    },
  );
  for (const probe of probes) {
    assert.deepEqual(probe.calls, [], "no proxy trap may run before the refusal");
  }
}

test("extracts the exact closed candidate from the fixed public synthetic one-page pdf", async () => {
  const bytes = freshFixtureBytes();
  assert.equal(bytes.byteLength, FIXTURE_BYTE_COUNT);
  assert.equal(sha256Hex(bytes), FIXTURE_PDF_SHA256);
  assert.equal(FIXTURE_TEXT.length, FIXTURE_CHARACTER_COUNT);
  assert.equal(
    createHash("sha256").update(FIXTURE_TEXT, "utf8").digest("hex"),
    FIXTURE_TEXT_SHA256,
    "text_sha256 is the sha256 of the utf8 joined page text",
  );

  const candidate = await extractProjectPdfCandidate({
    pdfBytes: bytes,
    expectedSha256: FIXTURE_PDF_SHA256,
  });

  assert.deepEqual(candidate, expectedCandidate());
  assert.deepEqual(Object.keys(candidate), [
    "schema_version",
    "status",
    "source",
    "extraction",
    "authority",
    "effects",
  ]);
  assert.deepEqual(Object.keys(candidate.source), ["media_type", "sha256", "byte_count"]);
  assert.deepEqual(Object.keys(candidate.extraction), [
    "engine",
    "page_count",
    "character_count",
    "text_sha256",
    "pages",
  ]);
  assert.deepEqual(Object.keys(candidate.extraction.pages[0]), ["page_number", "text"]);
  assert.deepEqual(Object.keys(candidate.authority), [
    "source_truth",
    "canon",
    "project_state",
    "approval",
  ]);
  assert.deepEqual(Object.keys(candidate.effects), [
    "persistent_writes",
    "network_calls",
    "model_calls",
    "rag_index_writes",
    "wiki_writes",
  ]);

  assert.equal(candidate.schema_version, "soulforge.project_document_ingest_candidate.v0");
  assert.equal(candidate.status, "candidate");
  assert.equal(candidate.source.media_type, "application/pdf");
  assert.equal(candidate.source.sha256, FIXTURE_PDF_SHA256);
  assert.equal(candidate.source.byte_count, FIXTURE_BYTE_COUNT);
  assert.equal(candidate.extraction.engine, "pymupdf");
  assert.equal(candidate.extraction.page_count, 1);
  assert.equal(candidate.extraction.pages.length, 1);
  assert.equal(candidate.extraction.pages[0].page_number, 1);
  assert.equal(candidate.extraction.pages[0].text, FIXTURE_TEXT);
  assert.equal(candidate.extraction.character_count, FIXTURE_CHARACTER_COUNT);
  assert.equal(candidate.extraction.text_sha256, FIXTURE_TEXT_SHA256);
  assert.equal(candidate.authority.source_truth, false);
  assert.equal(candidate.authority.canon, false);
  assert.equal(candidate.authority.project_state, false);
  assert.equal(candidate.authority.approval, false);
  assert.equal(candidate.effects.persistent_writes, 0);
  assert.equal(candidate.effects.network_calls, 0);
  assert.equal(candidate.effects.model_calls, 0);
  assert.equal(candidate.effects.rag_index_writes, 0);
  assert.equal(candidate.effects.wiki_writes, 0);
});

test("replays deterministically, accepts Buffer and offset views, snapshots caller bytes, and deep freezes output", async () => {
  const first = await extractProjectPdfCandidate({
    pdfBytes: freshFixtureBytes(),
    expectedSha256: FIXTURE_PDF_SHA256,
  });
  const second = await extractProjectPdfCandidate({
    pdfBytes: freshFixtureBytes(),
    expectedSha256: FIXTURE_PDF_SHA256,
  });
  assert.deepEqual(first, second);
  assert.notEqual(first, second, "each call must build a fresh output");

  const framed = new Uint8Array(FIXTURE_BYTE_COUNT + 8);
  framed.set(freshFixtureBytes(), 5);
  const view = framed.subarray(5, 5 + FIXTURE_BYTE_COUNT);
  assert.equal(view.byteOffset, 5);
  assert.equal(view.byteLength, FIXTURE_BYTE_COUNT);
  assert.equal(view instanceof Buffer, false);
  const fromView = await extractProjectPdfCandidate({
    pdfBytes: view,
    expectedSha256: FIXTURE_PDF_SHA256,
  });
  assert.deepEqual(fromView, expectedCandidate());

  const caller = freshFixtureBytes();
  const unchanged = await extractProjectPdfCandidate({
    pdfBytes: caller,
    expectedSha256: FIXTURE_PDF_SHA256,
  });
  assert.deepEqual(unchanged, expectedCandidate());
  assert.equal(caller.equals(freshFixtureBytes()), true, "caller bytes must not be mutated");

  const mutated = freshFixtureBytes();
  const pending = extractProjectPdfCandidate({
    pdfBytes: mutated,
    expectedSha256: FIXTURE_PDF_SHA256,
  });
  mutated.fill(0);
  const snapshotted = await pending;
  assert.deepEqual(snapshotted, expectedCandidate(), "input bytes must be snapshotted at call time");

  assertDeeplyFrozen(first, "candidate");
  assert.throws(() => {
    first.status = "accepted";
  }, TypeError);
  assert.throws(() => {
    first.extraction.pages[0].text = "";
  }, TypeError);
  assert.throws(() => {
    first.extraction.pages.push({ page_number: 2, text: "" });
  }, TypeError);
  assert.throws(() => {
    first.effects.network_calls = 1;
  }, TypeError);
});

test("rejects wrong pins before parsing and rejects malformed pins as invalid requests", async () => {
  // Bytes that are not a pdf at all: a wrong but well-formed pin must still lose to the
  // digest gate, which proves hash rejection precedes any pdf parsing.
  const notPdf = Buffer.from("soulforge red phase: not a pdf", "utf8");
  assert.notEqual(sha256Hex(notPdf), WRONG_WELL_FORMED_PIN);
  await assertRejectsWith(
    { pdfBytes: notPdf, expectedSha256: WRONG_WELL_FORMED_PIN },
    INPUT_DIGEST_MISMATCH,
  );

  assert.notEqual(NEAR_MISS_PIN, FIXTURE_PDF_SHA256);
  await assertRejectsWith(
    { pdfBytes: freshFixtureBytes(), expectedSha256: NEAR_MISS_PIN },
    INPUT_DIGEST_MISMATCH,
  );
  await assertRejectsWith(
    { pdfBytes: freshFixtureBytes(), expectedSha256: WRONG_WELL_FORMED_PIN },
    INPUT_DIGEST_MISMATCH,
  );

  const malformedPins = [
    FIXTURE_PDF_SHA256.toUpperCase(),
    FIXTURE_PDF_SHA256.slice(0, 63),
    `${FIXTURE_PDF_SHA256}a`,
    `${FIXTURE_PDF_SHA256.slice(0, 63)}g`,
    `sha256:${FIXTURE_PDF_SHA256}`,
    ` ${FIXTURE_PDF_SHA256}`,
    `${FIXTURE_PDF_SHA256}\n`,
    "",
    null,
    undefined,
    12345,
    Buffer.from(FIXTURE_PDF_SHA256, "utf8"),
    { sha256: FIXTURE_PDF_SHA256 },
  ];
  for (const expectedSha256 of malformedPins) {
    await assertRejectsWith({ pdfBytes: freshFixtureBytes(), expectedSha256 }, REQUEST_INVALID);
  }
});

test("reports a stable payload-free unreadable error for non-pdf bytes pinned correctly", async () => {
  const notPdf = Buffer.from("soulforge red phase: still not a pdf", "utf8");
  await assertRejectsWith(
    { pdfBytes: notPdf, expectedSha256: sha256Hex(notPdf) },
    PDF_UNREADABLE,
  );

  // A pdf header with no usable page must resolve to the same unreadable code, whether the
  // worker fails to parse it or parses it into zero pages.
  const headerOnly = Buffer.from("%PDF-1.7\n%%EOF\n", "utf8");
  await assertRejectsWith(
    { pdfBytes: headerOnly, expectedSha256: sha256Hex(headerOnly) },
    PDF_UNREADABLE,
  );

  const replay = Buffer.from("soulforge red phase: still not a pdf", "utf8");
  await assertRejectsWith(
    { pdfBytes: replay, expectedSha256: sha256Hex(replay) },
    PDF_UNREADABLE,
  );
});

test("accepts a strictly closed request and enforces the hard 16 MiB input cap", async () => {
  await assertRejectsWith({}, REQUEST_INVALID);
  await assertRejectsWith({ pdfBytes: freshFixtureBytes() }, REQUEST_INVALID);
  await assertRejectsWith({ expectedSha256: FIXTURE_PDF_SHA256 }, REQUEST_INVALID);

  for (const field of FORBIDDEN_REQUEST_FIELDS) {
    await assertRejectsWith(
      {
        pdfBytes: freshFixtureBytes(),
        expectedSha256: FIXTURE_PDF_SHA256,
        [field]: "ignored",
      },
      REQUEST_INVALID,
    );
  }

  await assertRejectsWith(
    {
      pdfBytes: freshFixtureBytes(),
      expectedSha256: FIXTURE_PDF_SHA256,
      [Symbol("extra")]: "ignored",
    },
    REQUEST_INVALID,
  );

  const bytesAccessor = {};
  Object.defineProperty(bytesAccessor, "pdfBytes", {
    get: () => freshFixtureBytes(),
    enumerable: true,
    configurable: true,
  });
  bytesAccessor.expectedSha256 = FIXTURE_PDF_SHA256;
  await assertRejectsWith(bytesAccessor, REQUEST_INVALID);

  const pinAccessor = { pdfBytes: freshFixtureBytes() };
  Object.defineProperty(pinAccessor, "expectedSha256", {
    get: () => FIXTURE_PDF_SHA256,
    enumerable: true,
    configurable: true,
  });
  await assertRejectsWith(pinAccessor, REQUEST_INVALID);

  const invalidBytes = [
    FIXTURE_BASE64,
    freshFixtureBytes().buffer,
    new DataView(freshFixtureBytes().buffer),
    new Int8Array(8),
    [...freshFixtureBytes()],
    new Uint8Array(0),
    Buffer.alloc(0),
    null,
    undefined,
    850,
  ];
  for (const pdfBytes of invalidBytes) {
    await assertRejectsWith({ pdfBytes, expectedSha256: FIXTURE_PDF_SHA256 }, REQUEST_INVALID);
  }

  // The cap is checked before the digest, so an oversized input never gets hashed.
  await assertRejectsWith(
    { pdfBytes: Buffer.alloc(MAX_INPUT_BYTES + 1), expectedSha256: WRONG_WELL_FORMED_PIN },
    INPUT_BYTES_TOO_LARGE,
  );
  await assertRejectsWith(
    { pdfBytes: new Uint8Array(MAX_INPUT_BYTES + 1), expectedSha256: WRONG_WELL_FORMED_PIN },
    INPUT_BYTES_TOO_LARGE,
  );
  // Exactly at the cap is still allowed through to the digest gate.
  await assertRejectsWith(
    { pdfBytes: Buffer.alloc(MAX_INPUT_BYTES), expectedSha256: WRONG_WELL_FORMED_PIN },
    INPUT_DIGEST_MISMATCH,
  );
});

test("refuses a proxy wrapped request root before a single reflection trap runs", async () => {
  const twin = await extractProjectPdfCandidate({
    pdfBytes: freshFixtureBytes(),
    expectedSha256: FIXTURE_PDF_SHA256,
  });
  assert.deepEqual(twin, expectedCandidate(), "the same shape without a proxy stays valid");

  const plainProbe = createTrapProbe({
    pdfBytes: freshFixtureBytes(),
    expectedSha256: FIXTURE_PDF_SHA256,
  });
  await assertRejectsUntouched(plainProbe.proxy, REQUEST_INVALID, [plainProbe]);

  const bareTarget = Object.create(null);
  bareTarget.pdfBytes = freshFixtureBytes();
  bareTarget.expectedSha256 = FIXTURE_PDF_SHA256;
  const bareProbe = createTrapProbe(bareTarget);
  await assertRejectsUntouched(bareProbe.proxy, REQUEST_INVALID, [bareProbe]);
});

test("refuses proxy wrapped bytes inside an ordinary request before any trap runs", async () => {
  const bufferProbe = createTrapProbe(freshFixtureBytes());
  await assertRejectsUntouched(
    { pdfBytes: bufferProbe.proxy, expectedSha256: FIXTURE_PDF_SHA256 },
    REQUEST_INVALID,
    [bufferProbe],
  );

  const plainBytes = new Uint8Array(freshFixtureBytes());
  assert.equal(plainBytes instanceof Buffer, false);
  const plainProbe = createTrapProbe(plainBytes);
  await assertRejectsUntouched(
    { pdfBytes: plainProbe.proxy, expectedSha256: FIXTURE_PDF_SHA256 },
    REQUEST_INVALID,
    [plainProbe],
  );
});

test("accepts a request root only when its prototype is exactly Object.prototype or null", async () => {
  const bare = Object.create(null);
  bare.pdfBytes = freshFixtureBytes();
  bare.expectedSha256 = FIXTURE_PDF_SHA256;
  assert.equal(Object.getPrototypeOf(bare), null);
  assert.deepEqual(await extractProjectPdfCandidate(bare), expectedCandidate());

  const dateRoot = new Date(0);
  dateRoot.pdfBytes = freshFixtureBytes();
  dateRoot.expectedSha256 = FIXTURE_PDF_SHA256;
  assert.equal(Reflect.ownKeys(dateRoot).length, 2);
  await assertRejectsWith(dateRoot, REQUEST_INVALID);

  class RequestLike {
    constructor() {
      this.pdfBytes = freshFixtureBytes();
      this.expectedSha256 = FIXTURE_PDF_SHA256;
    }
  }
  await assertRejectsWith(new RequestLike(), REQUEST_INVALID);

  const inherited = Object.create({ inheritedMarker: true });
  inherited.pdfBytes = freshFixtureBytes();
  inherited.expectedSha256 = FIXTURE_PDF_SHA256;
  await assertRejectsWith(inherited, REQUEST_INVALID);
});

test("keeps exact byte views and refuses impostor bytes without running their hooks", async () => {
  const framed = Buffer.alloc(FIXTURE_BYTE_COUNT + 9);
  freshFixtureBytes().copy(framed, 7);
  const bufferView = framed.subarray(7, 7 + FIXTURE_BYTE_COUNT);
  assert.equal(Buffer.isBuffer(bufferView), true);
  assert.equal(bufferView.byteOffset, framed.byteOffset + 7);
  assert.equal(bufferView.byteLength, FIXTURE_BYTE_COUNT);
  assert.deepEqual(
    await extractProjectPdfCandidate({
      pdfBytes: bufferView,
      expectedSha256: FIXTURE_PDF_SHA256,
    }),
    expectedCandidate(),
  );

  const plainFrame = new Uint8Array(FIXTURE_BYTE_COUNT + 3);
  plainFrame.set(freshFixtureBytes(), 3);
  const plainView = plainFrame.subarray(3);
  assert.equal(plainView instanceof Buffer, false);
  assert.equal(plainView.byteOffset, 3);
  assert.equal(plainView.byteLength, FIXTURE_BYTE_COUNT);
  assert.deepEqual(
    await extractProjectPdfCandidate({
      pdfBytes: plainView,
      expectedSha256: FIXTURE_PDF_SHA256,
    }),
    expectedCandidate(),
  );

  class TaggedBytes extends Uint8Array {}
  const tagged = new TaggedBytes(freshFixtureBytes());
  assert.equal(tagged.byteLength, FIXTURE_BYTE_COUNT);
  assert.equal(sha256Hex(tagged), FIXTURE_PDF_SHA256);
  await assertRejectsWith(
    { pdfBytes: tagged, expectedSha256: FIXTURE_PDF_SHA256 },
    REQUEST_INVALID,
  );

  const impostorBuffer = freshFixtureBytes();
  Object.setPrototypeOf(impostorBuffer, Object.create(Buffer.prototype));
  await assertRejectsWith(
    { pdfBytes: impostorBuffer, expectedSha256: FIXTURE_PDF_SHA256 },
    REQUEST_INVALID,
  );

  const impostorPlain = new Uint8Array(freshFixtureBytes());
  Object.setPrototypeOf(impostorPlain, Object.create(Uint8Array.prototype));
  await assertRejectsWith(
    { pdfBytes: impostorPlain, expectedSha256: FIXTURE_PDF_SHA256 },
    REQUEST_INVALID,
  );

  const strippedPlain = new Uint8Array(freshFixtureBytes());
  Object.setPrototypeOf(strippedPlain, null);
  await assertRejectsWith(
    { pdfBytes: strippedPlain, expectedSha256: FIXTURE_PDF_SHA256 },
    REQUEST_INVALID,
  );

  let shadowByteLengthReads = 0;
  const shadowedBytes = freshFixtureBytes();
  Object.defineProperty(shadowedBytes, "byteLength", {
    get() {
      shadowByteLengthReads += 1;
      return FIXTURE_BYTE_COUNT;
    },
    configurable: true,
  });
  await assertRejectsWith(
    { pdfBytes: shadowedBytes, expectedSha256: FIXTURE_PDF_SHA256 },
    REQUEST_INVALID,
  );
  assert.equal(shadowByteLengthReads, 0, "a shadow byteLength getter must never run");

  let iteratorReads = 0;
  const hookedBytes = freshFixtureBytes();
  Object.defineProperty(hookedBytes, Symbol.iterator, {
    get() {
      iteratorReads += 1;
      throw new Error("byte iterator must never run");
    },
    configurable: true,
  });
  await assertRejectsWith(
    { pdfBytes: hookedBytes, expectedSha256: FIXTURE_PDF_SHA256 },
    REQUEST_INVALID,
  );
  assert.equal(iteratorReads, 0, "a byte iterator hook must never run");
});

test("decodes worker stdout under an explicit fatal utf-8 decoder guarded into the unreadable path", () => {
  // Worker stdout is untrusted bytes. Decoding it under the replacement policy lets
  // malformed output become well formed text and reach JSON.parse, so the seam must
  // decode fatally and fold the decode failure into the same stable unreadable path.
  // This check reads only the ingest module this slice owns.
  const ingestSource = readFileSync(
    new URL("./project_document_ingest.mjs", import.meta.url),
    "utf8",
  );

  assert.match(
    ingestSource,
    /new\s+(?:\w+\.)?TextDecoder\(\s*"utf-?8"\s*,\s*\{[^{}]*\bfatal\s*:\s*true\b[^{}]*\}\s*\)/u,
    "worker stdout must be decoded by an explicit fatal utf-8 decoder",
  );

  const guardedBlocks = [
    ...ingestSource.matchAll(/try\s*\{([\s\S]*?)\}\s*catch\b[^{]*\{([\s\S]*?)\}/gu),
  ].map((match) => ({ body: match[1], handler: match[2] }));
  const fatalDecodeGuarded = guardedBlocks.some(({ body, handler }) => {
    const decodedAt = body.search(/\.decode\(/u);
    const parsedAt = body.indexOf("JSON.parse(");
    if (decodedAt === -1 || parsedAt === -1 || decodedAt > parsedAt) return false;
    return /return\s+null\s*;/u.test(handler);
  });
  assert.equal(
    fatalDecodeGuarded,
    true,
    "the fatal decode must run before JSON.parse inside one guarded block that falls back to the unreadable path",
  );

  const forbiddenDecodePatterns = [
    /rawOutput\.toString\(/u,
    /\.toString\(\s*"utf-?8"\s*\)/u,
    /\.toString\(\s*\)/u,
    /new\s+(?:\w+\.)?TextDecoder\((?![^)]*\bfatal\s*:\s*true\b)[^)]*\)/u,
    /\bfatal\s*:\s*false\b/u,
    /\bStringDecoder\b/u,
    /node:string_decoder/u,
  ];
  for (const pattern of forbiddenDecodePatterns) {
    assert.equal(
      pattern.test(ingestSource),
      false,
      `worker stdout must not be decoded with ${pattern.source}`,
    );
  }
});

test("bounds the worker stdin read at exactly one byte past the input cap", () => {
  // This check reads only the extraction unit this slice owns.
  const workerSource = readFileSync(
    new URL("./project_document_extract.py", import.meta.url),
    "utf8",
  );

  assert.match(
    workerSource,
    /sys\.stdin\.buffer\.read\(\s*MAX_INPUT_BYTES\s*\+\s*1\s*\)/u,
    "worker stdin read must be bounded at exactly one byte past the cap",
  );

  const forbiddenWorkerStdinPatterns = [/sys\.stdin\.buffer\.read\(\s*\)/u];
  for (const pattern of forbiddenWorkerStdinPatterns) {
    assert.equal(pattern.test(workerSource), false, `worker must not use ${pattern.source}`);
  }
});

test("pins the fixed worker, repo venv, stdin/stdout json seam, and the absent capabilities", () => {
  // This boundary check reads only the two production files this slice owns.
  const ingestSource = readFileSync(
    new URL("./project_document_ingest.mjs", import.meta.url),
    "utf8",
  );
  const workerSourceUrl = new URL("./project_document_extract.py", import.meta.url);
  assert.equal(workerSourceUrl.pathname.endsWith(WORKER_REF), true);
  const workerSource = readFileSync(workerSourceUrl, "utf8");

  assert.equal(ingestSource.split(WORKER_REF).length - 1, 1, "worker must be referenced once");
  assert.deepEqual(
    [...ingestSource.matchAll(/[\w./-]+\.py\b/gu)].map((match) => match[0]),
    [WORKER_REF],
    "no other worker filename may appear",
  );
  assert.match(ingestSource, /const\s+WORKER_REF\s*=\s*"guild_hall\/rag\/project_document_extract\.py"/u);

  assert.equal(ingestSource.includes(VENV_REF), true, "must use the fixed repo venv");
  assert.match(ingestSource, /python\.exe/u);
  assert.match(ingestSource, /win32/u);

  assert.match(ingestSource, /const\s+MAX_INPUT_BYTES\s*=\s*16\s*\*\s*1024\s*\*\s*1024\b/u);
  assert.match(ingestSource, /const\s+MAX_WORKER_OUTPUT_BYTES\s*=\s*[\d_*\s]+;/u);
  assert.match(ingestSource, /const\s+WORKER_TIMEOUT_MS\s*=\s*[\d_*\s]+;/u);
  assert.match(ingestSource, /\bkill\(/u, "the worker must be killed on timeout");

  assert.match(ingestSource, /node:child_process/u);
  assert.match(ingestSource, /\bspawn\b/u);
  assert.match(ingestSource, /\bstdin\b/u);
  assert.match(ingestSource, /\bstdout\b/u);
  assert.match(ingestSource, /JSON\.parse\(/u);
  assert.match(ingestSource, /createHash\("sha256"\)/u);
  assert.match(ingestSource, /\["pdfBytes",\s*"expectedSha256"\]/u, "request keys stay closed");
  assert.match(ingestSource, /getOwnPropertyDescriptor/u, "accessor requests must be refused");
  assert.match(ingestSource, /from\s+"node:util"/u, "proxy detection must come from node:util");
  assert.match(ingestSource, /\btypes\.isProxy\(/u, "proxy roots and proxy bytes must be refused");
  assert.match(ingestSource, /getPrototypeOf/u, "request and byte prototypes must be pinned exactly");
  assert.match(ingestSource, /unreadable/u);

  assert.deepEqual(
    [...new Set([...ingestSource.matchAll(/ingestError\("(\w+)"\)/gu)].map((match) => match[1]))].sort(),
    ["input_bytes_too_large", "input_digest_mismatch", "pdf_unreadable", "request_invalid"],
    "a malformed stdout decode must reuse pdf_unreadable and add no new error code",
  );

  for (const effectKey of [
    "persistent_writes",
    "network_calls",
    "model_calls",
    "rag_index_writes",
    "wiki_writes",
  ]) {
    const occurrences = [...ingestSource.matchAll(new RegExp(`${effectKey}\\b`, "gu"))].length;
    assert.equal(occurrences, 1, `${effectKey} may appear only in the declared effects`);
    assert.match(ingestSource, new RegExp(`${effectKey}: 0`, "u"));
  }

  const forbiddenIngestPatterns = [
    /node:fs\b/u,
    /node:(http|https|net|tls|dns|dgram)\b/u,
    /\bfetch\s*\(/u,
    /\bprocess\.env\b/u,
    /\bshell\b/u,
    /\brequire\s*\(/u,
    /\bwriteFile\b/u,
    /\bappendFile\b/u,
    /\bcreateWriteStream\b/u,
    /\bmkdtemp\b/u,
    /\bprojectId\b/u,
    /\bproject_id\b/u,
    /\bcallback\b/iu,
    /\bprovider\b/iu,
    /\bwriter\b/iu,
    /\bTaskDriver\b/iu,
    /\bembedding/iu,
    /\banthropic\b/iu,
    /\bopenai\b/iu,
    /\bsqlite\b/iu,
  ];
  for (const pattern of forbiddenIngestPatterns) {
    assert.equal(pattern.test(ingestSource), false, `ingest must not use ${pattern.source}`);
  }

  assert.match(workerSource, /\bimport\s+(fitz|pymupdf)\b/u);
  assert.match(workerSource, /json\.dumps\(/u);
  assert.match(workerSource, /sys\.stdout/u);
  assert.match(workerSource, /"page_count"/u);
  assert.match(workerSource, /"pages"/u);
  assert.match(workerSource, /"page_number"/u);
  assert.match(workerSource, /"unreadable"/u);

  const forbiddenWorkerPatterns = [
    /\bimport\s+os\b/u,
    /\bos\.environ\b/u,
    /\bsys\.argv\b/u,
    /\bargparse\b/u,
    /\bsubprocess\b/u,
    /\bsocket\b/u,
    /\brequests\b/u,
    /\burllib\b/u,
    /\bshutil\b/u,
    /\btempfile\b/u,
    /\bpathlib\b/u,
    /(?<![.\w])open\s*\(/u,
    /\beval\s*\(/u,
    /\btraceback\b/iu,
  ];
  for (const pattern of forbiddenWorkerPatterns) {
    assert.equal(pattern.test(workerSource), false, `worker must not use ${pattern.source}`);
  }
});

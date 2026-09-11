import assert from "node:assert/strict";
import childProcess from "node:child_process";
import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import { readFileSync, readdirSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { resolve } from "node:path";
import { PassThrough } from "node:stream";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { extractProjectPdfCandidate } from "./project_document_ingest.mjs";

const PROFILE = "pdfplumber-tables-v1";
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const request = (pdfBytes = Buffer.from("synthetic pinned bytes")) => ({ pdfBytes, expectedSha256: sha256(pdfBytes) });
const options = { interpreterPath: resolve("trusted-test-python"), extractionProfile: PROFILE };
const defaultReport = { status: "extracted", engine: "pymupdf", page_count: 1, pages: [{ page_number: 1, text: "body\n" }] };
const profileReport = () => ({
  status: "extracted", engine: "pdfplumber", profile: PROFILE, engine_version: "0.11.9", page_count: 1,
  pages: [{ page_number: 1, text: "body", width: 100, height: 100, coordinate_system: "top-left-points",
    paragraphs: [{ paragraph_number: 1, text: "body", bbox: [1, 1, 20, 10] }],
    words: [{ word_number: 1, text: "body", bbox: [1, 1, 20, 10] }], tables: [{
      table_number: 1, bbox: [1, 20, 30, 40], row_count: 1, column_count: 1,
      rows: [{ row_number: 1, bbox: [1, 20, 30, 40] }], columns: [{ column_number: 1, bbox: [1, 20, 30, 40] }],
      cells: [{ row_number: 1, column_number: 1, text: "cell", bbox: [1, 20, 30, 40] }],
    }] }],
});

async function withWorker(t, report, run, exitCode = 0) {
  const calls = [];
  t.mock.method(childProcess, "spawn", (executable, args, config) => {
    const child = new EventEmitter();
    child.stdin = new PassThrough();
    child.stdout = new PassThrough();
    child.kill = () => { calls.at(-1).killed = true; };
    const call = { executable, args, config, input: null, killed: false };
    calls.push(call);
    const chunks = [];
    child.stdin.on("data", (chunk) => chunks.push(chunk));
    child.stdin.on("finish", () => {
      call.input = Buffer.concat(chunks);
      child.stdout.emit("data", Buffer.isBuffer(report) ? report : Buffer.from(JSON.stringify(report)));
      child.emit("close", exitCode);
    });
    return child;
  });
  syncBuiltinESMExports();
  try { await run(calls); } finally { t.mock.restoreAll(); syncBuiltinESMExports(); }
}

test("default candidate keeps its exact original shape and fixed worker invocation", async (t) => {
  await withWorker(t, defaultReport, async (calls) => {
    const req = request();
    const candidate = await extractProjectPdfCandidate(req);
    assert.deepEqual(candidate, {
      schema_version: "soulforge.project_document_ingest_candidate.v0", status: "candidate",
      source: { media_type: "application/pdf", sha256: req.expectedSha256, byte_count: req.pdfBytes.length },
      extraction: { engine: "pymupdf", page_count: 1, character_count: 5, text_sha256: sha256("body\n"), pages: defaultReport.pages },
      authority: { source_truth: false, canon: false, project_state: false, approval: false },
      effects: { persistent_writes: 0, network_calls: 0, model_calls: 0, rag_index_writes: 0, wiki_writes: 0 },
    });
    assert.match(calls[0].executable.replaceAll("\\", "/"), /source_extraction_venv\/(Scripts\/python.exe|bin\/python)$/u);
    assert.deepEqual(calls[0].args.slice(0, 2), ["-I", "-B"]);
    assert.equal(calls[0].args.length, 3);
    assert.match(calls[0].args[2].replaceAll("\\", "/"), /guild_hall\/rag\/project_document_extract.py$/u);
    assert.equal(calls[0].config.shell, undefined);
    assert.deepEqual(calls[0].input, req.pdfBytes);
  });
});

test("closed trusted options and hostile requests fail before a process starts", async (t) => {
  await withWorker(t, profileReport(), async (calls) => {
    let traps = 0;
    const accessor = Object.defineProperty({ extractionProfile: PROFILE }, "interpreterPath", { get() { traps += 1; } });
    const proxy = new Proxy(options, { getPrototypeOf() { traps += 1; return Object.prototype; } });
    for (const value of [null, {}, "python", { ...options, extra: true }, { ...options, extractionProfile: "other" },
      { ...options, interpreterPath: "python" }, { ...options, interpreterPath: "./python" },
      { ...options, interpreterPath: `${options.interpreterPath}\0` }, accessor, proxy]) {
      await assert.rejects(extractProjectPdfCandidate(request(), value), { code: "request_invalid" });
    }
    const reqProxy = new Proxy(request(), { ownKeys() { traps += 1; return []; } });
    await assert.rejects(extractProjectPdfCandidate(reqProxy, options), { code: "request_invalid" });
    await assert.rejects(extractProjectPdfCandidate({ ...request(), expectedSha256: "0".repeat(64) }, options), { code: "input_digest_mismatch" });
    await assert.rejects(extractProjectPdfCandidate({ ...request(), interpreterPath: options.interpreterPath }, options), { code: "request_invalid" });
    await assert.rejects(extractProjectPdfCandidate({ pdfBytes: Buffer.alloc(16 * 1024 * 1024 + 1), expectedSha256: "0".repeat(64) }, options), { code: "input_bytes_too_large" });
    assert.equal(traps, 0);
    assert.equal(calls.length, 0);
  });
});

test("profile pins the worker, snapshots input, freezes geometry and binds its full digest", async (t) => {
  await withWorker(t, profileReport(), async (calls) => {
    const req = request();
    const original = Buffer.from(req.pdfBytes);
    const pending = extractProjectPdfCandidate(req, options);
    req.pdfBytes.fill(0);
    const candidate = await pending;
    const extraction = candidate.extraction;
    assert.equal(candidate.pages, undefined);
    assert.equal(extraction.profile, PROFILE);
    assert.equal(calls[0].executable, options.interpreterPath);
    assert.equal(calls[0].args.at(-1), PROFILE);
    assert.equal(calls[0].args.length, 4);
    assert.deepEqual(calls[0].input, original);
    const bound = { source_sha256: candidate.source.sha256, profile: extraction.profile,
      engine: extraction.engine, engine_version: extraction.engine_version, pages: extraction.pages };
    assert.equal(extraction.extraction_sha256, sha256(JSON.stringify(bound)));
    for (const mutate of [value => { value.source_sha256 = "0".repeat(64); },
      value => { value.profile = "other"; }, value => { value.engine_version = "0.11.10"; },
      value => { value.pages[0].words[0].bbox[0] = 2; }]) {
      const changed = structuredClone(bound);
      mutate(changed);
      assert.notEqual(sha256(JSON.stringify(changed)), extraction.extraction_sha256);
    }
    assert.ok(Object.isFrozen(extraction.pages[0].words[0].bbox));
    assert.ok(Object.isFrozen(candidate));
  });
});

test("explicit APP no-site option retains the fixed worker and disables automatic startup", {
  skip: process.platform !== "win32",
}, async (t) => {
  await withWorker(t, profileReport(), async (calls) => {
    await extractProjectPdfCandidate(request(), { ...options, disableSiteStartup: true });
    assert.deepEqual(calls[0].args.slice(0, 4), ["-I", "-B", "-S", "-c"]);
    assert.match(calls[0].args.at(-2).replaceAll("\\", "/"), /guild_hall\/rag\/project_document_extract.py$/u);
    assert.equal(calls[0].args.at(-1), PROFILE);
    assert.equal(calls[0].config.shell, undefined);
  });
});

test("malformed, oversized, mismatched and unsuccessful worker reports fail closed", async (t) => {
  const reports = [Buffer.from([0xff]), Buffer.from("{"), Buffer.alloc(8 * 1024 * 1024 + 1), defaultReport];
  for (const mutate of [value => { value.profile = "other"; }, value => { value.engine_version = ""; },
    value => { value.pages[0].words[0].bbox[0] = -1; }, value => { value.pages[0].width = null; },
    value => { value.pages[0].words[0].extra = true; }, value => { value.pages[0].words = []; value.pages[0].paragraphs = null; },
    value => { value.pages[0].text = "x".repeat(512 * 1024 + 1); },
    value => { value.pages[0].words = Array(100001).fill(value.pages[0].words[0]); },
    value => { value.pages[0].tables[0].cells[0].row_number = 2; },
    value => { value.pages[0].tables[0].cells[0].bbox = null; },
    value => { value.pages[0].tables[0].rows[0].bbox = [0, 0, 100, 100]; },
    value => { value.pages[0].tables[0].column_count = 2; }]) {
    const report = profileReport(); mutate(report); reports.push(report);
  }
  for (const report of reports) {
    await withWorker(t, report, async (calls) => {
      await assert.rejects(extractProjectPdfCandidate(request(), options), { code: "pdf_unreadable" });
      if (Buffer.isBuffer(report) && report.length > 8 * 1024 * 1024) assert.equal(calls[0].killed, true);
    });
  }
  await withWorker(t, profileReport(), async () => {
    await assert.rejects(extractProjectPdfCandidate(request(), options), { code: "pdf_unreadable" });
  }, 1);
});

test("explicit available interpreter extracts the public PDF body and exact ruled table geometry", {
  skip: !process.env.SOULFORGE_PDF_TEST_PYTHON && "set SOULFORGE_PDF_TEST_PYTHON to an absolute interpreter with pdfplumber",
}, async () => {
  const fixture = new URL("../../docs/architecture/workspace/examples/context-memory/t5-document-current.pdf", import.meta.url);
  const pdfBytes = readFileSync(fixture);
  const before = readdirSync(new URL("./", import.meta.url), { recursive: true }).sort();
  const trusted = { interpreterPath: process.env.SOULFORGE_PDF_TEST_PYTHON, extractionProfile: PROFILE };
  const candidate = await extractProjectPdfCandidate(request(pdfBytes), trusted);
  const second = await extractProjectPdfCandidate(request(pdfBytes), trusted);
  assert.deepEqual(second, candidate);
  if (process.platform === "win32") {
    const isolated = await extractProjectPdfCandidate(request(pdfBytes), { ...trusted, disableSiteStartup: true });
    assert.deepEqual(isolated, candidate, "no-site APP parse preserves actual PDF and table extraction");
  }
  assert.equal(candidate.source.sha256, sha256(pdfBytes));
  assert.equal(candidate.extraction.page_count, 2);
  assert.equal(candidate.extraction.engine, "pdfplumber");
  assert.ok(candidate.extraction.pages[0].paragraphs.some(item => item.text.includes("D-CURRENT:") && item.text.includes("28 V")));
  assert.ok(candidate.extraction.pages[0].words.every(item => item.bbox.length === 4));
  const table = candidate.extraction.pages[1].tables[0];
  assert.deepEqual(table.bbox, [50, 182, 545, 302]);
  assert.equal(table.row_count, 2);
  assert.equal(table.column_count, 2);
  assert.deepEqual(table.rows.map(item => item.bbox), [[50, 182, 545, 242], [50, 242, 545, 302]]);
  assert.deepEqual(table.columns.map(item => item.bbox), [[50, 182, 300, 302], [300, 182, 545, 302]]);
  assert.deepEqual(table.cells.map(item => [item.row_number, item.column_number, item.text, item.bbox]), [
    [1, 1, "D-CURRENT", [50, 182, 300, 242]], [1, 2, "28V", [300, 182, 545, 242]],
    [2, 1, "C-LIMIT", [50, 242, 300, 302]], [2, 2, "2A", [300, 242, 545, 302]],
  ]);
  assert.deepEqual(readdirSync(new URL("./", import.meta.url), { recursive: true }).sort(), before);
  assert.deepEqual(readFileSync(fixture), pdfBytes);
  await assert.rejects(extractProjectPdfCandidate(request(), trusted), { code: "pdf_unreadable" });
  await assert.rejects(extractProjectPdfCandidate(request(), { ...trusted, interpreterPath: resolve("does-not-exist-python") }), { code: "pdf_unreadable" });
  const invalidProfile = childProcess.spawnSync(trusted.interpreterPath,
    ["-I", "-B", fileURLToPath(new URL("./project_document_extract.py", import.meta.url)), "unknown-profile"],
    { input: pdfBytes, windowsHide: true, maxBuffer: 1024, timeout: 30000 });
  assert.equal(invalidProfile.status, 0);
  assert.deepEqual(JSON.parse(invalidProfile.stdout.toString("utf8")), { status: "unreadable" });
});

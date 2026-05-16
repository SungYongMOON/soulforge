import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  buildKnowledgeAccessEvent,
  normalizeKnowledgeRef,
  readKnowledgeRefAndRecord,
  recordKnowledgeAccess,
  resolveLedgerTarget,
  validateKnowledgeAccessEvent,
} from "./ledger.mjs";

test("readKnowledgeRefAndRecord returns target content and appends one metadata-only row", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-knowledge-read-"));
  const knowledgeRef = "docs/knowledge/public-note.md";
  const ledgerRoot = path.join(repoRoot, "_workmeta", "TEST", "reports", "knowledge_access");
  const body = "PUBLIC_KNOWLEDGE_BODY_SHOULD_NOT_ENTER_LEDGER";

  try {
    await writeFixture(repoRoot, knowledgeRef, body);

    const result = await readKnowledgeRefAndRecord({
      repoRoot,
      knowledgeRef,
      ledgerRoot,
      now: "2026-05-16T01:02:03.456Z",
      actorType: "tool",
      actorId: "knowledge_access_test",
      reasonUsed: "fixture read smoke",
      outputRef: "_workmeta/TEST/reports/knowledge_access/read_smoke.md",
      taskRef: "task:knowledge_access_read_smoke",
      outcomeState: "useful",
    });

    assert.equal(result.content, body);
    assert.equal(result.ledger_ref, "_workmeta/TEST/reports/knowledge_access/events/2026/2026-05.jsonl");

    const rows = await readRows(result.ledger_path);
    assert.equal(rows.length, 1);
    assert.equal(validateKnowledgeAccessEvent(rows[0]).ok, true);
    assert.equal(rows[0].schema_version, "soulforge.knowledge_access_event.v0");
    assert.equal(rows[0].workflow_id, "knowledge_access_event_capture_v0");
    assert.equal(rows[0].timestamp_utc, "2026-05-16T01:02:03Z");
    assert.equal(rows[0].capture_mode, "manual_agent_entry");
    assert.equal(rows[0].actor.type, "tool");
    assert.equal(rows[0].actor.id, "knowledge_access_test");
    assert.equal(rows[0].target.knowledge_ref, knowledgeRef);
    assert.equal(rows[0].access_type, "read");
    assert.equal(rows[0].reason_used, "fixture read smoke");
    assert.equal(rows[0].work_context.task_ref, "task:knowledge_access_read_smoke");
    assert.equal(rows[0].outcome_state, "useful");
    assert.deepEqual(rows[0].redaction, {
      metadata_only: true,
      manual_agent_note_payload_free: true,
      payload_copied: false,
      secret_present: false,
      runtime_absolute_path_present: false,
    });
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("recordKnowledgeAccess appends a use event without reading a target payload", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-knowledge-record-"));
  const ledgerFile = path.join(repoRoot, "_workmeta", "TEST", "reports", "knowledge_access", "manual.jsonl");

  try {
    const result = await recordKnowledgeAccess({
      repoRoot,
      knowledgeRef: "docs/knowledge/nonexistent-but-stable-ref.md",
      ledgerFile,
      now: "2026-05-16T02:03:04.000Z",
      actorType: "workflow",
      actorId: "workflow_fixture",
      accessType: "cite",
      reasonUsed: "metadata-only citation fixture",
      outputRef: "_workmeta/TEST/reports/knowledge_access/citation.md",
      workflowId: "knowledge_access_event_capture_v0",
    });

    const rows = await readRows(result.ledger_path);
    assert.equal(rows.length, 1);
    assert.equal(validateKnowledgeAccessEvent(rows[0]).ok, true);
    assert.equal(rows[0].target.knowledge_ref, "docs/knowledge/nonexistent-but-stable-ref.md");
    assert.equal(rows[0].access_type, "cite");
    assert.equal(rows[0].work_context.workflow_id, "knowledge_access_event_capture_v0");
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("ledger row contains refs and metadata but not the read file body", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-knowledge-no-payload-"));
  const knowledgeRef = "docs/knowledge/body.md";
  const ledgerRoot = path.join(repoRoot, "_workmeta", "TEST", "reports", "knowledge_access");
  const body = "DO_NOT_COPY_THIS_PUBLIC_FIXTURE_PAYLOAD";

  try {
    await writeFixture(repoRoot, knowledgeRef, body);

    const result = await readKnowledgeRefAndRecord({
      repoRoot,
      knowledgeRef,
      ledgerRoot,
      now: "2026-05-16T03:04:05.000Z",
      reasonUsed: "verify payload-free ledger",
    });

    const rawLedger = await readFile(result.ledger_path, "utf8");
    assert.equal(result.content, body);
    assert.equal(rawLedger.includes(knowledgeRef), true);
    assert.equal(rawLedger.includes("verify payload-free ledger"), true);
    assert.equal(rawLedger.includes(body), false);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("secret-like and blocked knowledge refs are rejected without appending rows", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-knowledge-blocked-"));
  const ledgerRoot = path.join(repoRoot, "_workmeta", "TEST", "reports", "knowledge_access");
  const ledger = resolveLedgerTarget({ repoRoot, ledgerRoot, now: "2026-05-16T04:05:06.000Z" });

  try {
    await assert.rejects(
      () =>
        recordKnowledgeAccess({
          repoRoot,
          knowledgeRef: "docs/knowledge/.env",
          ledgerRoot,
          now: "2026-05-16T04:05:06.000Z",
        }),
      /knowledge_ref_secret_like_path_blocked/,
    );
    await assert.rejects(
      () =>
        recordKnowledgeAccess({
          repoRoot,
          knowledgeRef: "guild_hall/state/operations/private-note.md",
          ledgerRoot,
          now: "2026-05-16T04:05:06.000Z",
        }),
      /knowledge_ref_root_blocked: guild_hall\/state/,
    );
    await assert.rejects(
      () =>
        recordKnowledgeAccess({
          repoRoot,
          knowledgeRef: "_workmeta/TEST/reports/source.md",
          ledgerRoot,
          now: "2026-05-16T04:05:06.000Z",
        }),
      /knowledge_ref_root_blocked: _workmeta/,
    );
    await assertFileMissing(ledger.path);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("path traversal and absolute knowledge refs are rejected without appending rows", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-knowledge-paths-"));
  const ledgerRoot = path.join(repoRoot, "_workmeta", "TEST", "reports", "knowledge_access");
  const absoluteRef = path.join(repoRoot, "docs", "knowledge", "absolute.md");
  const ledger = resolveLedgerTarget({ repoRoot, ledgerRoot, now: "2026-05-16T05:06:07.000Z" });

  try {
    await assert.rejects(
      () =>
        recordKnowledgeAccess({
          repoRoot,
          knowledgeRef: "../outside.md",
          ledgerRoot,
          now: "2026-05-16T05:06:07.000Z",
        }),
      /knowledge_ref_must_not_use_path_traversal/,
    );
    await assert.rejects(
      () =>
        recordKnowledgeAccess({
          repoRoot,
          knowledgeRef: absoluteRef,
          ledgerRoot,
          now: "2026-05-16T05:06:07.000Z",
        }),
      /knowledge_ref_must_be_repo_relative/,
    );
    await assertFileMissing(ledger.path);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("embedded runtime absolute paths in metadata are rejected without appending rows", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-knowledge-metadata-paths-"));
  const ledgerRoot = path.join(repoRoot, "_workmeta", "TEST", "reports", "knowledge_access");
  const ledger = resolveLedgerTarget({ repoRoot, ledgerRoot, now: "2026-05-16T06:06:06.000Z" });

  try {
    await assert.rejects(
      () =>
        recordKnowledgeAccess({
          repoRoot,
          knowledgeRef: "docs/knowledge/public-note.md",
          ledgerRoot,
          now: "2026-05-16T06:06:06.000Z",
          reasonUsed: "checked C:\\Soulforge\\private\\runtime-note.md during routing",
        }),
      /reason_used_must_not_be_absolute_path/,
    );
    await assert.rejects(
      () =>
        recordKnowledgeAccess({
          repoRoot,
          knowledgeRef: "docs/knowledge/public-note.md",
          ledgerRoot,
          now: "2026-05-16T06:06:06.000Z",
          reasonUsed: "checked /Users/user/Soulforge/private/runtime-note.md during routing",
        }),
      /reason_used_must_not_be_absolute_path/,
    );
    await assertFileMissing(ledger.path);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("normalization and event ids are deterministic for validation-safe Windows inputs", () => {
  const repoRoot = "C:\\Soulforge";
  const first = buildKnowledgeAccessEvent({
    repoRoot,
    knowledgeRef: "docs\\knowledge\\windows-path.md",
    ledgerRef: "_workmeta/TEST/reports/knowledge_access/events/2026/2026-05.jsonl",
    now: "2026-05-16T06:07:08.999Z",
    actorId: "windows_fixture",
    reasonUsed: "windows slash normalization",
  });
  const second = buildKnowledgeAccessEvent({
    repoRoot,
    knowledgeRef: "docs/knowledge/windows-path.md",
    ledgerRef: "_workmeta/TEST/reports/knowledge_access/events/2026/2026-05.jsonl",
    now: "2026-05-16T06:07:08.999Z",
    actorId: "windows_fixture",
    reasonUsed: "windows slash normalization",
  });

  assert.equal(normalizeKnowledgeRef("docs\\knowledge\\windows-path.md"), "docs/knowledge/windows-path.md");
  assert.equal(first.event_id, second.event_id);
  assert.equal(first.timestamp_utc, "2026-05-16T06:07:08Z");
  assert.equal(validateKnowledgeAccessEvent(first).ok, true);
});

async function writeFixture(repoRoot, relativePath, body) {
  const filePath = path.join(repoRoot, ...relativePath.split("/"));
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, body, "utf8");
}

async function readRows(filePath) {
  const raw = await readFile(filePath, "utf8");
  return raw.trim().split(/\r?\n/u).filter(Boolean).map((line) => JSON.parse(line));
}

async function assertFileMissing(filePath) {
  await assert.rejects(() => readFile(filePath, "utf8"), /ENOENT/);
}

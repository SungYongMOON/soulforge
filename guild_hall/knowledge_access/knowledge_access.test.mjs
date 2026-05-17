import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { parse as parseYaml } from "yaml";
import {
  analyzeKnowledgeAccessLedgers,
  buildKnowledgeAccessEvent,
  normalizeKnowledgeRef,
  readKnowledgeRefAndRecord,
  recordKnowledgeAccess,
  resolveLedgerTarget,
  validateKnowledgeAccessEvent,
} from "./ledger.mjs";
import { importNotebookLmBridgeMetadata } from "./notebooklm_bridge.mjs";

const execFileAsync = promisify(execFile);
const knowledgeAccessDir = path.dirname(fileURLToPath(import.meta.url));
const cliPath = path.join(knowledgeAccessDir, "cli.mjs");
const notebookLmBridgeFixtureDir = path.resolve(
  knowledgeAccessDir,
  "..",
  "..",
  "docs",
  "architecture",
  "workspace",
  "examples",
  "notebooklm_bridge",
);

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

test("analyzeKnowledgeAccessLedgers rolls up explicit JSONL ledgers without copying row notes", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-knowledge-rollup-"));
  const ledgerFile = path.join(repoRoot, "_workmeta", "TEST", "reports", "knowledge_access", "manual.jsonl");

  try {
    await recordKnowledgeAccess({
      repoRoot,
      knowledgeRef: "docs/knowledge/a.md",
      ledgerFile,
      now: "2026-05-16T07:00:00.000Z",
      actorType: "tool",
      actorId: "tool_fixture",
      accessType: "read",
      outcomeState: "useful",
      workflowId: "workflow_fixture",
      manualAgentNote: "DO_NOT_COPY_THIS_LEDGER_NOTE",
    });
    await recordKnowledgeAccess({
      repoRoot,
      knowledgeRef: "docs/knowledge/a.md",
      ledgerFile,
      now: "2026-05-16T07:05:00.000Z",
      actorType: "workflow",
      actorId: "workflow_fixture_actor",
      accessType: "cite",
      outcomeState: "blocked",
      workflowId: "workflow_fixture",
    });
    await recordKnowledgeAccess({
      repoRoot,
      knowledgeRef: "docs/knowledge/b.md",
      ledgerFile,
      now: "2026-05-16T07:10:00.000Z",
      actorType: "skill",
      actorId: "skill_fixture_actor",
      accessType: "promote",
      outcomeState: "promoted",
      skillId: "skill_fixture",
    });

    const result = await analyzeKnowledgeAccessLedgers({
      repoRoot,
      ledgerFiles: ledgerFile,
      now: "2026-05-16T08:00:00.000Z",
    });

    assert.equal(result.kind, "knowledge_access_rollup_analysis");
    assert.equal(result.source_ledger_refs[0], "_workmeta/TEST/reports/knowledge_access/manual.jsonl");
    assert.equal(result.accepted_event_count, 3);
    assert.equal(result.invalid_event_count, 0);
    assert.equal(result.duplicate_event_count, 0);
    assert.equal(result.usage_rollup.time_window.starts_at_utc, "2026-05-16T07:00:00Z");
    assert.equal(result.usage_rollup.time_window.ends_at_utc, "2026-05-16T07:10:00Z");

    const targetA = result.usage_rollup.counts_by_target.find((row) => row.knowledge_ref === "docs/knowledge/a.md");
    assert.equal(targetA.total_access_count, 2);
    assert.equal(targetA.useful_access_count, 1);
    assert.equal(targetA.blocked_access_count, 1);
    assert.equal(targetA.cite_or_promote_count, 1);
    assert.deepEqual(targetA.actor_type_counts, { tool: 1, workflow: 1 });
    assert.deepEqual(targetA.access_type_counts, { cite: 1, read: 1 });
    assert.deepEqual(targetA.context_counts, { "workflow:workflow_fixture": 2 });

    const targetB = result.usage_rollup.counts_by_target.find((row) => row.knowledge_ref === "docs/knowledge/b.md");
    assert.equal(targetB.total_access_count, 1);
    assert.equal(targetB.cite_or_promote_count, 1);
    assert.deepEqual(targetB.context_counts, { "skill:skill_fixture": 1 });
    assert.equal(result.boundary_review_note.boundary_decision, "metadata_rollup_only");
    assert.equal(result.boundary_review_note.checks.archive_retire_not_executed.pass, true);

    const serialized = JSON.stringify(result);
    assert.equal(serialized.includes("DO_NOT_COPY_THIS_LEDGER_NOTE"), false);
    assert.equal(serialized.includes(repoRoot), false);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("NotebookLM bridge imported_log_entry rows roll up to the synthetic expected summary", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-knowledge-notebooklm-"));
  const ledgerFile = path.join(repoRoot, "_workmeta", "TEST", "reports", "knowledge_access", "notebooklm_bridge.jsonl");

  try {
    await copyNotebookLmBridgeFixtures(repoRoot);
    const expectedBundle = await readNotebookLmExpectedBundle();
    const expectedImport = expectedBundle.expected_bridge_import;
    const expected = expectedBundle.expected_analysis;

    const importResult = await importNotebookLmBridgeMetadata({
      repoRoot,
      bindingRef: expectedImport.binding_ref,
      ledgerFile,
      now: "2026-05-16T12:30:00.000Z",
    });

    assert.equal(importResult.kind, expectedImport.kind);
    assert.equal(importResult.status, expectedImport.status);
    assert.equal(importResult.binding_ref, expectedImport.binding_ref);
    assert.equal(importResult.source_ledger_ref, expectedImport.source_ledger_ref);
    assert.equal(importResult.query_log_ref, expectedImport.query_log_ref);
    assert.equal(importResult.ledger_ref, expectedImport.ledger_ref);
    assert.equal(importResult.source_ledger_row_count, expectedImport.source_ledger_row_count);
    assert.equal(importResult.query_log_row_count, expectedImport.query_log_row_count);
    assert.equal(importResult.imported_event_count, expectedImport.imported_event_count);
    assert.equal(importResult.blocked_event_count, expectedImport.blocked_event_count);
    assert.deepEqual(
      importResult.usage_summary.counts_by_target.map((row) => row.knowledge_ref),
      expectedImport.usage_targets,
    );
    assert.equal(importResult.authority_boundary.nlm_calls_executed, false);
    assert.equal(importResult.authority_boundary.auth_or_session_files_read, false);
    assert.equal(importResult.authority_boundary.payload_copied, false);
    assert.equal(importResult.authority_boundary.notebooklm_advisory_only, true);
    assert.equal(importResult.authority_boundary.canon_or_ontology_mutated, false);
    assert.equal(importResult.authority_boundary.no_events_fabricated_when_query_log_empty, "not_applicable");

    const rows = await readRows(ledgerFile);
    assert.equal(rows.length, expectedImport.imported_event_count);
    assert.equal(rows.every((row) => validateKnowledgeAccessEvent(row).ok), true);
    assert.equal(rows.every((row) => row.capture_mode === "imported_log_entry"), true);
    assert.deepEqual(
      rows.map((row) => row.event_id),
      importResult.imported_events.map((event) => event.event_id),
    );

    const result = importResult.analysis;
    assert.equal(result.kind, expected.kind);
    assert.equal(result.status, expected.status);
    assert.equal(result.source_ledger_refs[0], expected.source_ledger_ref);
    assert.equal(result.accepted_event_count, expected.accepted_event_count);
    assert.equal(result.invalid_event_count, expected.invalid_event_count);
    assert.equal(result.duplicate_event_count, expected.duplicate_event_count);
    assert.equal(result.usage_rollup.time_window.starts_at_utc, expected.time_window.starts_at_utc);
    assert.equal(result.usage_rollup.time_window.ends_at_utc, expected.time_window.ends_at_utc);
    assertTargetSummaries(result.usage_rollup.counts_by_target, expected.counts_by_target);
    assert.equal(result.boundary_review_note.boundary_decision, expected.boundary_decision);
    assert.equal(result.boundary_review_note.checks.advisory_handoff_not_authority.pass, true);
    assert.deepEqual(result.authority_boundary, expected.metadata_boundary);

    const serialized = JSON.stringify(importResult);
    assert.equal(serialized.includes("Synthetic source payload"), false);
    assert.equal(serialized.includes(repoRoot), false);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("NotebookLM bridge reduces imported query-log reasons to safe labels without copying payload-like reason text", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-knowledge-notebooklm-reason-"));
  const ledgerFile = path.join(repoRoot, "_workmeta", "TEST", "reports", "knowledge_access", "notebooklm_bridge_reason.jsonl");
  const bindingRef = "bridge/binding.json";
  const sourceLedgerRef = "bridge/source_ledger.json";
  const queryLogRef = "bridge/query_log.json";
  const payloadReasonToken = "DO_NOT_COPY_QUERY_REASON_PAYLOAD";

  try {
    await writeFixture(
      repoRoot,
      bindingRef,
      JSON.stringify(
        {
          bridge_surface: {
            source_ledger_ref: sourceLedgerRef,
            query_log_ref: queryLogRef,
          },
          import_policy: {
            capture_mode: "imported_log_entry",
            actor: {
              type: "advisory_handoff",
              id: "synthetic_notebooklm_bridge",
            },
            default_work_context: {
              workflow_id: "synthetic_notebooklm_bridge_fixture",
            },
          },
        },
        null,
        2,
      ),
    );
    await writeFixture(
      repoRoot,
      sourceLedgerRef,
      JSON.stringify(
        {
          sources: [
            {
              source_ref: "synthetic-source-001",
              source_kind: "synthetic_text",
              payload_state: "omitted",
            },
          ],
        },
        null,
        2,
      ),
    );
    await writeFixture(
      repoRoot,
      queryLogRef,
      JSON.stringify(
        {
          queries: [
            {
              entry_ref: "entry-payload-reason",
              timestamp_utc: "2026-05-16T12:20:00Z",
              actor_type: "advisory_handoff",
              target_knowledge_ref: "docs/knowledge/safe-advisory-target.md",
              access_type: "summarize",
              outcome_state: "useful",
              source_ref: "synthetic-source-001",
              query_ref: "synthetic-query-004",
              reason_label: "safe_reason_label",
              reason_used: `${payloadReasonToken}: copied answer body from an imported advisory response.`,
              reason: `${payloadReasonToken}: alternate payload-like reason text.`,
            },
          ],
        },
        null,
        2,
      ),
    );

    const importResult = await importNotebookLmBridgeMetadata({
      repoRoot,
      bindingRef,
      ledgerFile,
      now: "2026-05-16T12:30:00.000Z",
    });

    assert.equal(importResult.status, "imported");
    assert.equal(importResult.imported_event_count, 1);
    assert.equal(importResult.authority_boundary.no_events_fabricated_when_query_log_empty, "not_applicable");

    const rows = await readRows(ledgerFile);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].reason_used, "notebooklm_import:safe_reason_label");
    assert.equal(validateKnowledgeAccessEvent(rows[0]).ok, true);

    const rawLedger = await readFile(ledgerFile, "utf8");
    const serializedImport = JSON.stringify(importResult);
    assert.equal(rawLedger.includes(payloadReasonToken), false);
    assert.equal(serializedImport.includes(payloadReasonToken), false);
    assert.equal(rawLedger.includes("copied answer body"), false);
    assert.equal(rawLedger.includes("alternate payload-like reason text"), false);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("NotebookLM bridge rejects source-ledger payload columns before importing rows", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-knowledge-notebooklm-source-payload-column-"));
  const ledgerFile = path.join(repoRoot, "_workmeta", "TEST", "reports", "knowledge_access", "notebooklm_source_payload_column.jsonl");
  const payloadToken = "DO_NOT_COPY_SOURCE_PAYLOAD_COLUMN";

  try {
    await writeNotebookLmBridgeCaseRows(
      repoRoot,
      [
        {
          entry_ref: "entry-source-payload-column",
          timestamp_utc: "2026-05-16T12:20:00Z",
          target_knowledge_ref: "docs/knowledge/safe-advisory-target.md",
          access_type: "summarize",
          outcome_state: "useful",
          source_ref: "synthetic-source-001",
          reason_label: "safe_reason_label",
        },
      ],
      {
        sourceRows: [
          {
            source_ref: "synthetic-source-001",
            source_kind: "synthetic_text",
            payload_state: "omitted",
            source_text: payloadToken,
          },
        ],
      },
    );

    await assert.rejects(
      () =>
        importNotebookLmBridgeMetadata({
          repoRoot,
          bindingRef: "bridge/binding.json",
          ledgerFile,
          now: "2026-05-16T12:30:00.000Z",
        }),
      (error) => {
        assert.match(error.message, /source_ledger_payload_columns_blocked: bridge\/source_ledger\.json/u);
        assert.equal(error.message.includes(payloadToken), false);
        assert.equal(error.message.includes("source_text"), false);
        return true;
      },
    );
    await assertFileMissing(ledgerFile);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("NotebookLM bridge rejects query-log payload columns before importing rows", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-knowledge-notebooklm-query-payload-column-"));
  const ledgerFile = path.join(repoRoot, "_workmeta", "TEST", "reports", "knowledge_access", "notebooklm_query_payload_column.jsonl");
  const payloadToken = "DO_NOT_COPY_QUERY_PAYLOAD_COLUMN";

  try {
    await writeNotebookLmBridgeCase(repoRoot, {
      entry_ref: "entry-query-payload-column",
      timestamp_utc: "2026-05-16T12:20:00Z",
      target_knowledge_ref: "docs/knowledge/safe-advisory-target.md",
      access_type: "summarize",
      outcome_state: "useful",
      source_ref: "synthetic-source-001",
      reason_label: "safe_reason_label",
      query_text: payloadToken,
    });

    await assert.rejects(
      () =>
        importNotebookLmBridgeMetadata({
          repoRoot,
          bindingRef: "bridge/binding.json",
          ledgerFile,
          now: "2026-05-16T12:30:00.000Z",
        }),
      (error) => {
        assert.match(error.message, /query_log_payload_columns_blocked: bridge\/query_log\.json/u);
        assert.equal(error.message.includes(payloadToken), false);
        assert.equal(error.message.includes("query_text"), false);
        return true;
      },
    );
    await assertFileMissing(ledgerFile);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("NotebookLM bridge blocks malformed timestamp_utc rows instead of importing with current time", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-knowledge-notebooklm-bad-timestamp-"));
  const ledgerFile = path.join(repoRoot, "_workmeta", "TEST", "reports", "knowledge_access", "notebooklm_bad_timestamp.jsonl");

  try {
    await writeNotebookLmBridgeCase(repoRoot, {
      entry_ref: "entry-bad-timestamp",
      timestamp_utc: "not-a-timestamp",
      target_knowledge_ref: "docs/knowledge/safe-advisory-target.md",
      access_type: "summarize",
      outcome_state: "useful",
      source_ref: "synthetic-source-001",
      reason_label: "safe_reason_label",
    });

    const importResult = await importNotebookLmBridgeMetadata({
      repoRoot,
      bindingRef: "bridge/binding.json",
      ledgerFile,
      now: "2026-05-16T12:30:00.000Z",
    });

    assert.equal(importResult.status, "blocked");
    assert.equal(importResult.imported_event_count, 0);
    assert.equal(importResult.blocked_event_count, 1);
    assert.equal(importResult.blockers[0].entry_ref, "entry-bad-timestamp");
    assert.deepEqual(importResult.blockers[0].errors, ["timestamp_utc_must_be_second_precision_utc"]);
    assert.deepEqual(importResult.imported_events, []);
    assert.deepEqual(importResult.usage_summary.counts_by_target, []);
    assert.equal(importResult.analysis, null);
    await assertFileMissing(ledgerFile);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("NotebookLM bridge blocks unsafe entry_ref paths before deriving event refs", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-knowledge-notebooklm-unsafe-entry-"));
  const ledgerFile = path.join(repoRoot, "_workmeta", "TEST", "reports", "knowledge_access", "notebooklm_unsafe_entry.jsonl");
  const unsafeEntryRef = "/Users/example/.notebooklm/session.json";

  try {
    await writeNotebookLmBridgeCase(repoRoot, {
      entry_ref: unsafeEntryRef,
      timestamp_utc: "2026-05-16T12:20:00Z",
      target_knowledge_ref: "docs/knowledge/safe-advisory-target.md",
      access_type: "summarize",
      outcome_state: "useful",
      source_ref: "synthetic-source-001",
      reason_label: "safe_reason_label",
    });

    const importResult = await importNotebookLmBridgeMetadata({
      repoRoot,
      bindingRef: "bridge/binding.json",
      ledgerFile,
      now: "2026-05-16T12:30:00.000Z",
    });

    assert.equal(importResult.status, "blocked");
    assert.equal(importResult.imported_event_count, 0);
    assert.equal(importResult.blocked_event_count, 1);
    assert.equal(importResult.blockers[0].entry_ref, "blocked_sensitive_path");
    assert.deepEqual(importResult.blockers[0].errors, ["entry_ref_unsafe_path_blocked"]);
    assert.deepEqual(importResult.imported_events, []);
    const serialized = JSON.stringify(importResult);
    assert.equal(serialized.includes(unsafeEntryRef), false);
    assert.equal(serialized.includes("/.notebooklm/session.json"), false);
    assert.equal(serialized.includes("session.json"), false);
    await assertFileMissing(ledgerFile);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("NotebookLM bridge normalizes invalid enum blockers without echoing query-log cell values", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-knowledge-notebooklm-invalid-enum-"));
  const ledgerFile = path.join(repoRoot, "_workmeta", "TEST", "reports", "knowledge_access", "notebooklm_invalid_enum.jsonl");
  const badActorType = "DO_NOT_ECHO_BAD_ACTOR_TYPE copied advisory answer";
  const badAccessType = "DO_NOT_ECHO_BAD_ACCESS_TYPE copied advisory answer";
  const badOutcomeState = "DO_NOT_ECHO_BAD_OUTCOME_STATE copied advisory answer";

  try {
    await writeNotebookLmBridgeCaseRows(repoRoot, [
      {
        entry_ref: "entry-bad-actor-type",
        timestamp_utc: "2026-05-16T12:20:00Z",
        actor_type: badActorType,
        target_knowledge_ref: "docs/knowledge/safe-advisory-target.md",
        access_type: "summarize",
        outcome_state: "useful",
        source_ref: "synthetic-source-001",
        reason_label: "safe_reason_label",
      },
      {
        entry_ref: "entry-bad-access-type",
        timestamp_utc: "2026-05-16T12:21:00Z",
        actor_type: "advisory_handoff",
        target_knowledge_ref: "docs/knowledge/safe-advisory-target.md",
        access_type: badAccessType,
        outcome_state: "useful",
        source_ref: "synthetic-source-001",
        reason_label: "safe_reason_label",
      },
      {
        entry_ref: "entry-bad-outcome-state",
        timestamp_utc: "2026-05-16T12:22:00Z",
        actor_type: "advisory_handoff",
        target_knowledge_ref: "docs/knowledge/safe-advisory-target.md",
        access_type: "summarize",
        outcome_state: badOutcomeState,
        source_ref: "synthetic-source-001",
        reason_label: "safe_reason_label",
      },
    ]);

    const importResult = await importNotebookLmBridgeMetadata({
      repoRoot,
      bindingRef: "bridge/binding.json",
      ledgerFile,
      now: "2026-05-16T12:30:00.000Z",
    });

    assert.equal(importResult.status, "blocked");
    assert.equal(importResult.imported_event_count, 0);
    assert.equal(importResult.blocked_event_count, 3);
    assert.deepEqual(
      importResult.blockers.map((blocker) => blocker.errors[0]),
      ["actor.type_not_allowed", "access_type_not_allowed", "outcome_state_not_allowed"],
    );
    assert.deepEqual(importResult.imported_events, []);
    assert.deepEqual(importResult.usage_summary.counts_by_target, []);
    assert.equal(importResult.analysis, null);

    const serialized = JSON.stringify(importResult);
    assert.equal(serialized.includes(badActorType), false);
    assert.equal(serialized.includes(badAccessType), false);
    assert.equal(serialized.includes(badOutcomeState), false);
    assert.equal(serialized.includes("copied advisory answer"), false);
    await assertFileMissing(ledgerFile);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("NotebookLM bridge blocks no-query logs without fabricating imported events", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-knowledge-notebooklm-no-query-"));
  const ledgerFile = path.join(repoRoot, "_workmeta", "TEST", "reports", "knowledge_access", "notebooklm_bridge_no_query.jsonl");

  try {
    await copyNotebookLmBridgeFixtures(repoRoot);
    const expected = (await readNotebookLmExpectedBundle()).expected_no_query_bridge_import;

    const importResult = await importNotebookLmBridgeMetadata({
      repoRoot,
      bindingRef: expected.binding_ref,
      ledgerFile,
      now: "2026-05-16T12:30:00.000Z",
    });

    assert.equal(importResult.kind, expected.kind);
    assert.equal(importResult.status, expected.status);
    assert.equal(importResult.binding_ref, expected.binding_ref);
    assert.equal(importResult.source_ledger_ref, expected.source_ledger_ref);
    assert.equal(importResult.query_log_ref, expected.query_log_ref);
    assert.equal(importResult.ledger_ref, expected.ledger_ref);
    assert.equal(importResult.source_ledger_row_count, expected.source_ledger_row_count);
    assert.equal(importResult.query_log_row_count, expected.query_log_row_count);
    assert.equal(importResult.imported_event_count, expected.imported_event_count);
    assert.equal(importResult.blocked_event_count, expected.blocked_event_count);
    assert.equal(importResult.blockers[0].code, expected.blocker_code);
    assert.deepEqual(importResult.imported_events, []);
    assert.deepEqual(importResult.usage_summary.counts_by_target, []);
    assert.equal(importResult.analysis, null);
    assert.equal(importResult.authority_boundary.no_events_fabricated_when_query_log_empty, true);
    await assertFileMissing(ledgerFile);

    const serialized = JSON.stringify(importResult);
    assert.equal(serialized.includes("Source intake pattern seed"), false);
    assert.equal(serialized.includes(repoRoot), false);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("CLI notebooklm-bridge imports explicit metadata files only", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-knowledge-notebooklm-cli-"));
  const ledgerFile = path.join(repoRoot, "_workmeta", "TEST", "reports", "knowledge_access", "notebooklm_bridge_cli.jsonl");

  try {
    await copyNotebookLmBridgeFixtures(repoRoot);
    const expected = (await readNotebookLmExpectedBundle()).expected_bridge_import;
    const { stdout } = await execFileAsync(process.execPath, [
      cliPath,
      "notebooklm-bridge",
      "--repo-root",
      repoRoot,
      "--binding-ref",
      expected.binding_ref,
      "--ledger-file",
      ledgerFile,
    ]);
    const importResult = JSON.parse(stdout);

    assert.equal(importResult.status, "imported");
    assert.equal(importResult.imported_event_count, expected.imported_event_count);
    assert.equal(importResult.authority_boundary.nlm_calls_executed, false);
    assert.equal(importResult.authority_boundary.auth_or_session_files_read, false);
    assert.equal(importResult.authority_boundary.canon_or_ontology_mutated, false);

    const rows = await readRows(ledgerFile);
    assert.equal(rows.length, expected.imported_event_count);
    assert.equal(JSON.stringify(importResult).includes(repoRoot), false);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("analyzeKnowledgeAccessLedgers reports unsafe rows without echoing payloads or absolute paths", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-knowledge-rollup-boundary-"));
  const ledgerFile = path.join(repoRoot, "_workmeta", "TEST", "reports", "knowledge_access", "unsafe.jsonl");

  try {
    const event = buildKnowledgeAccessEvent({
      repoRoot,
      knowledgeRef: "docs/knowledge/public.md",
      ledgerRef: "_workmeta/TEST/reports/knowledge_access/unsafe.jsonl",
      now: "2026-05-16T09:00:00.000Z",
      reasonUsed: "safe reason before mutation",
    });
    event.reason_used = "checked /Users/example/private/runtime-note.md during analysis";
    event.capture_mode = "DO_NOT_ECHO_BAD_CAPTURE_MODE";
    event.actor.type = "DO_NOT_ECHO_BAD_ACTOR_TYPE";
    event.access_type = "DO_NOT_ECHO_BAD_ACCESS_TYPE";
    event.outcome_state = "DO_NOT_ECHO_BAD_OUTCOME_STATE";
    event.DO_NOT_ECHO_ROW_KEY = "/Users/example/private/key-leak.md";

    await mkdir(path.dirname(ledgerFile), { recursive: true });
    await writeFile(ledgerFile, `${JSON.stringify(event)}\n{"payload":"PRIVATE_PAYLOAD"\n`, "utf8");

    const result = await analyzeKnowledgeAccessLedgers({
      repoRoot,
      ledgerRefs: "_workmeta/TEST/reports/knowledge_access/unsafe.jsonl",
      now: "2026-05-16T09:30:00.000Z",
    });

    assert.equal(result.accepted_event_count, 0);
    assert.equal(result.invalid_event_count, 2);
    assert.equal(result.boundary_review_note.boundary_decision, "review_required");
    assert.equal(result.boundary_review_note.checks.no_runtime_absolute_path.pass, false);
    assert.equal(result.boundary_review_note.blockers.length, 2);
    assert.deepEqual(result.usage_rollup.counts_by_target, []);

    const serialized = JSON.stringify(result);
    assert.equal(serialized.includes("/Users/example"), false);
    assert.equal(serialized.includes("PRIVATE_PAYLOAD"), false);
    assert.equal(serialized.includes("DO_NOT_ECHO_BAD_CAPTURE_MODE"), false);
    assert.equal(serialized.includes("DO_NOT_ECHO_BAD_ACTOR_TYPE"), false);
    assert.equal(serialized.includes("DO_NOT_ECHO_BAD_ACCESS_TYPE"), false);
    assert.equal(serialized.includes("DO_NOT_ECHO_BAD_OUTCOME_STATE"), false);
    assert.equal(serialized.includes("DO_NOT_ECHO_ROW_KEY"), false);
    assert.equal(serialized.includes("capture_mode_not_allowed"), true);
    assert.equal(serialized.includes("actor.type_not_allowed"), true);
    assert.equal(serialized.includes("access_type_not_allowed"), true);
    assert.equal(serialized.includes("outcome_state_not_allowed"), true);
    assert.equal(serialized.includes("event_field_contains_runtime_absolute_path"), true);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("analyzeKnowledgeAccessLedgers requires explicit JSONL ledger files or private/local ledger refs", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-knowledge-rollup-inputs-"));

  try {
    await assert.rejects(
      () => analyzeKnowledgeAccessLedgers({ repoRoot }),
      /provide_at_least_one_ledger_file_or_ledger_ref/,
    );
    await assert.rejects(
      () => analyzeKnowledgeAccessLedgers({ repoRoot, ledgerRefs: "docs/events.jsonl" }),
      /ledger_ref_inside_repo_must_be_private_metadata_or_local_state/,
    );
    await assert.rejects(
      () => analyzeKnowledgeAccessLedgers({ repoRoot, ledgerRefs: "_workmeta/TEST/events.txt" }),
      /ledger_file_must_be_jsonl/,
    );
    await assert.rejects(
      () => analyzeKnowledgeAccessLedgers({ repoRoot, ledgerFiles: path.join(repoRoot, "docs", "events.jsonl") }),
      /ledger_file_inside_repo_must_be_private_metadata_or_local_state/,
    );
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("CLI analyze emits metadata-only rollup JSON", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-knowledge-rollup-cli-"));
  const ledgerFile = path.join(repoRoot, "_workmeta", "TEST", "reports", "knowledge_access", "cli.jsonl");

  try {
    await recordKnowledgeAccess({
      repoRoot,
      knowledgeRef: "docs/knowledge/cli.md",
      ledgerFile,
      now: "2026-05-16T10:00:00.000Z",
      actorType: "tool",
      actorId: "cli_fixture",
      accessType: "cite",
      reasonUsed: "cli rollup fixture",
    });

    const { stdout } = await execFileAsync(process.execPath, [
      cliPath,
      "analyze",
      "--repo-root",
      repoRoot,
      "--ledger-file",
      ledgerFile,
    ]);
    const result = JSON.parse(stdout);

    assert.equal(result.kind, "knowledge_access_rollup_analysis");
    assert.equal(result.accepted_event_count, 1);
    assert.equal(result.usage_rollup.counts_by_target[0].knowledge_ref, "docs/knowledge/cli.md");
    assert.equal(JSON.stringify(result).includes(repoRoot), false);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
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

async function readNotebookLmExpectedBundle() {
  const raw = await readFile(path.join(notebookLmBridgeFixtureDir, "expected_bridge_summary.yaml"), "utf8");
  return parseYaml(raw);
}

async function copyNotebookLmBridgeFixtures(repoRoot) {
  const fixtureRefs = [
    "expected_bridge_summary.yaml",
    "synthetic_notebooklm_binding.yaml",
    "synthetic_notebooklm_binding_no_query.yaml",
    "synthetic_notebooklm_query_log.md",
    "synthetic_notebooklm_query_log_no_query.md",
    "synthetic_notebooklm_source_ledger.md",
  ];

  for (const basename of fixtureRefs) {
    const sourcePath = path.join(notebookLmBridgeFixtureDir, basename);
    const targetPath = path.join(
      repoRoot,
      "docs",
      "architecture",
      "workspace",
      "examples",
      "notebooklm_bridge",
      basename,
    );
    await mkdir(path.dirname(targetPath), { recursive: true });
    await copyFile(sourcePath, targetPath);
  }
}

async function writeNotebookLmBridgeCase(repoRoot, queryRow) {
  await writeNotebookLmBridgeCaseRows(repoRoot, [queryRow]);
}

async function writeNotebookLmBridgeCaseRows(repoRoot, queryRows, options = {}) {
  await writeFixture(
    repoRoot,
    "bridge/binding.json",
    JSON.stringify(
      {
        bridge_surface: {
          source_ledger_ref: "bridge/source_ledger.json",
          query_log_ref: "bridge/query_log.json",
        },
        import_policy: {
          capture_mode: "imported_log_entry",
          actor: {
            type: "advisory_handoff",
            id: "synthetic_notebooklm_bridge",
          },
          default_work_context: {
            workflow_id: "synthetic_notebooklm_bridge_fixture",
          },
        },
      },
      null,
      2,
    ),
  );
  await writeFixture(
    repoRoot,
    "bridge/source_ledger.json",
    JSON.stringify(
      {
        sources: options.sourceRows ?? [
          {
            source_ref: "synthetic-source-001",
            source_kind: "synthetic_text",
            payload_state: "omitted",
          },
        ],
      },
      null,
      2,
    ),
  );
  await writeFixture(
    repoRoot,
    "bridge/query_log.json",
    JSON.stringify(
      {
        queries: queryRows,
      },
      null,
      2,
    ),
  );
}

function assertTargetSummaries(actualRows, expectedRows) {
  assert.equal(actualRows.length, expectedRows.length);
  for (const expected of expectedRows) {
    const actual = actualRows.find((row) => row.knowledge_ref === expected.knowledge_ref);
    assert.ok(actual, `missing target summary for ${expected.knowledge_ref}`);
    assert.equal(actual.total_access_count, expected.total_access_count);
    assert.equal(actual.useful_access_count, expected.useful_access_count);
    assert.equal(actual.blocked_access_count, expected.blocked_access_count);
    assert.equal(actual.cite_or_promote_count, expected.cite_or_promote_count);
    assert.equal(actual.last_access_timestamp_utc, expected.last_access_timestamp_utc);
    assert.deepEqual(actual.actor_type_counts, expected.actor_type_counts);
    assert.deepEqual(actual.access_type_counts, expected.access_type_counts);
    assert.deepEqual(actual.context_counts, expected.context_counts);
  }
}

async function assertFileMissing(filePath) {
  await assert.rejects(() => readFile(filePath, "utf8"), /ENOENT/);
}

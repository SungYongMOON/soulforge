import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import {
  appendKnowledgeIngestReceipt,
  buildKnowledgeIngestMissingAudit,
  buildKnowledgeIngestReceipt,
  validateKnowledgeIngestMissingAuditRef,
  validateKnowledgeIngestReceipt,
  validateKnowledgeIngestReceiptLedgers,
} from "./knowledge_ingest_receipt.mjs";

const execFileAsync = promisify(execFile);
const knowledgeAccessDir = path.dirname(fileURLToPath(import.meta.url));
const cliPath = path.join(knowledgeAccessDir, "cli.mjs");

test("buildKnowledgeIngestReceipt creates deterministic metadata-only layer receipt ids", () => {
  const first = buildKnowledgeIngestReceipt({
    createdAt: "2026-06-19T01:02:03.456Z",
    projectCode: "system",
    captureSurface: "knowledge_ingest_cell",
    ingestRequestRef: "_workmeta/system/reports/procedure_capture/knowledge_ingest_request.md",
    summaryLabel: "cross PC knowledge candidate needs later processing",
    sourceThreadRef: "_workmeta/system/runs/knowledge_ingest_receipt_guard_20260619/NIGHT_WORK_HANDOFF.md",
    sourcePcLabel: "other-pc-metadata",
    layerStates: {
      candidate: {
        status: "recorded",
        ref: "_workmeta/system/knowledge_rag_candidate_ledger/events/2026-06.jsonl#L1",
      },
      source: {
        status: "stored",
        ref: "_workspaces/knowledge/source_cards/safe_public_metadata.source_card.json",
      },
      wiki: { status: "missing" },
      rag: { status: "owner_decision_needed" },
      canon: { status: "missing" },
    },
  });
  const second = buildKnowledgeIngestReceipt({
    createdAt: "2026-06-19T09:09:09.000Z",
    projectCode: "system",
    captureSurface: "knowledge_ingest_cell",
    ingestRequestRef: "_workmeta/system/reports/procedure_capture/knowledge_ingest_request.md",
    summaryLabel: "cross PC knowledge candidate needs later processing",
    sourceThreadRef: "_workmeta/system/runs/knowledge_ingest_receipt_guard_20260619/NIGHT_WORK_HANDOFF.md",
    sourcePcLabel: "other-pc-metadata",
    layerStates: first.layer_states,
  });

  assert.equal(first.receipt_id, second.receipt_id);
  assert.equal(first.created_at, "2026-06-19T01:02:03Z");
  assert.equal(first.layer_states.source.status, "stored");
  assert.equal(first.layer_states.rag.next_action, "Owner decision required before advancing rag.");
  assert.equal(validateKnowledgeIngestReceipt(first).ok, true);
  assert.equal(JSON.stringify(first).includes("C:"), false);
});

test("appendKnowledgeIngestReceipt, validation, and missing audit use explicit metadata ledgers only", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-ingest-receipt-"));

  try {
    const result = await appendKnowledgeIngestReceipt({
      repoRoot,
      ledgerRef: "_workmeta/system/knowledge_ingest_receipts/events/2026-06.jsonl",
      createdAt: "2026-06-19T02:03:04.000Z",
      projectCode: "system",
      captureSurface: "codex_chat",
      ingestRequestRef: "_workmeta/system/reports/procedure_capture/cross_pc_candidate.md",
      summaryLabel: "chat surfaced a reusable knowledge candidate",
      layerStates: {
        candidate: {
          status: "recorded",
          ref: "_workmeta/system/knowledge_rag_candidate_ledger/events/2026-06.jsonl#L7",
        },
        source: { status: "missing" },
        wiki: { status: "missing" },
        rag: { status: "missing" },
        canon: { status: "missing" },
      },
    });

    assert.equal(result.ledger_ref, "_workmeta/system/knowledge_ingest_receipts/events/2026-06.jsonl");
    assert.equal(result.receipt.project_code, "system");
    assert.equal(JSON.stringify(result.receipt).includes(repoRoot), false);

    const validation = await validateKnowledgeIngestReceiptLedgers({
      repoRoot,
      ledgerRefs: "_workmeta/system/knowledge_ingest_receipts/events/2026-06.jsonl",
    });
    assert.equal(validation.status, "pass");
    assert.equal(validation.accepted_receipt_count, 1);

    const audit = await buildKnowledgeIngestMissingAudit({
      repoRoot,
      ledgerRefs: "_workmeta/system/knowledge_ingest_receipts/events/2026-06.jsonl",
      now: "2026-06-19T02:10:00.000Z",
      auditId: "synthetic_receipt_audit",
    });
    assert.equal(audit.status, "complete");
    assert.equal(audit.open_receipt_count, 1);
    assert.deepEqual(audit.table[0].missing_layers, ["source", "wiki", "rag", "canon"]);
    assert.equal(audit.table[0].completion_state, "open_missing_layers");
    assert.equal(audit.boundary.source_payloads_read, false);
    assert.equal(JSON.stringify(audit).includes(repoRoot), false);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("CLI can append a receipt, write a missing audit table, and validate the audit", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-ingest-receipt-cli-"));
  const ledgerFile = path.join(os.tmpdir(), `soulforge-ingest-receipt-${Date.now()}.jsonl`);

  try {
    const appendResult = JSON.parse(
      (
        await execFileAsync(process.execPath, [
          cliPath,
          "ingest-receipt-append",
          "--repo-root",
          repoRoot,
          "--ledger-file",
          ledgerFile,
          "--created-at",
          "2026-06-19T03:04:05.000Z",
          "--project-code",
          "P02-002",
          "--capture-surface",
          "uploaded_file",
          "--ingest-request-ref",
          "_workmeta/P02-002/reports/procedure_capture/uploaded_file_candidate.md",
          "--summary-label",
          "uploaded file needs knowledge ingest follow-up",
          "--candidate-status",
          "recorded",
          "--candidate-ref",
          "_workmeta/P02-002/knowledge_rag_candidate_ledger/events/2026-06.jsonl#L1",
          "--source-status",
          "stored",
          "--source-ref",
          "_workspaces/knowledge/source_cards/p02_safe_metadata.source_card.json",
          "--wiki-status",
          "missing",
          "--rag-status",
          "owner_decision_needed",
          "--canon-status",
          "missing",
          "--json",
        ])
      ).stdout,
    );

    assert.equal(appendResult.status, "recorded");
    assert.equal(appendResult.receipt.project_code, "P02-002");
    assert.equal(appendResult.receipt.layer_states.rag.status, "owner_decision_needed");
    assert.equal("ledger_path" in appendResult, false);
    assert.equal(JSON.stringify(appendResult).includes(repoRoot), false);
    assert.equal(JSON.stringify(appendResult).includes(ledgerFile), false);

    const auditResult = JSON.parse(
      (
        await execFileAsync(process.execPath, [
          cliPath,
          "ingest-receipt-missing-audit",
          "--repo-root",
          repoRoot,
          "--ledger-file",
          ledgerFile,
          "--now",
          "2026-06-19T03:10:00.000Z",
          "--audit-id",
          "synthetic_cli_receipt_audit",
          "--output-root-ref",
          "_workmeta/system/reports/knowledge_ingest_missing_audit/synthetic_cli_receipt_audit",
          "--write",
        ])
      ).stdout,
    );

    assert.equal(auditResult.status, "complete");
    assert.equal(auditResult.output_refs.json, "_workmeta/system/reports/knowledge_ingest_missing_audit/synthetic_cli_receipt_audit/missing_audit.json");
    assert.deepEqual(auditResult.table[0].owner_decision_layers, ["rag"]);
    assert.equal(auditResult.table[0].completion_state, "owner_decision_needed");

    const writtenAudit = JSON.parse(await readFile(path.join(repoRoot, auditResult.output_refs.json), "utf8"));
    assert.equal(writtenAudit.audit_id, "synthetic_cli_receipt_audit");

    const validateResult = JSON.parse(
      (
        await execFileAsync(process.execPath, [
          cliPath,
          "ingest-receipt-missing-audit-validate",
          "--repo-root",
          repoRoot,
          "--audit-ref",
          auditResult.output_refs.json,
        ])
      ).stdout,
    );
    assert.equal(validateResult.status, "pass");

    const directValidation = await validateKnowledgeIngestMissingAuditRef({
      repoRoot,
      auditRef: auditResult.output_refs.json,
    });
    assert.equal(directValidation.status, "pass");
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
    await rm(ledgerFile, { force: true });
  }
});

test("receipt validation rejects raw payload keys, raw payload refs, and unsafe claims without echoing payloads", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-ingest-receipt-invalid-"));
  const ledgerFile = path.join(repoRoot, "_workmeta", "system", "knowledge_ingest_receipts", "invalid.jsonl");
  const payloadToken = "DO_NOT_ECHO_PRIVATE_PAYLOAD";

  try {
    const valid = buildKnowledgeIngestReceipt({
      createdAt: "2026-06-19T04:05:06.000Z",
      projectCode: "system",
      captureSurface: "manual_note",
      ingestRequestRef: "_workmeta/system/reports/procedure_capture/safe_receipt.md",
      summaryLabel: "safe metadata receipt",
      layerStates: {
        candidate: { status: "recorded", ref: "_workmeta/system/knowledge_rag_candidate_ledger/events/2026-06.jsonl#L2" },
        source: { status: "missing" },
        wiki: { status: "missing" },
        rag: { status: "missing" },
        canon: { status: "missing" },
      },
    });
    const invalid = {
      ...valid,
      source_payload: payloadToken,
      layer_states: {
        ...valid.layer_states,
        source: { ...valid.layer_states.source, ref: "_workspaces/knowledge/raw/raw-source.pdf" },
      },
      claim_ceiling: "canon_entry",
    };
    await mkdir(path.dirname(ledgerFile), { recursive: true });
    await writeFile(ledgerFile, `${JSON.stringify(invalid)}\n`, "utf8");

    const result = await validateKnowledgeIngestReceiptLedgers({
      repoRoot,
      ledgerRefs: "_workmeta/system/knowledge_ingest_receipts/invalid.jsonl",
    });

    assert.equal(result.status, "fail");
    assert.equal(result.accepted_receipt_count, 0);
    assert.equal(result.invalid_receipt_count, 1);
    const serialized = JSON.stringify(result);
    assert.equal(serialized.includes(payloadToken), false);
    assert.equal(serialized.includes("forbidden_raw_or_payload_key"), true);
    assert.equal(serialized.includes("raw_payload_ref_or_extension"), true);
    assert.equal(serialized.includes("canon_entry_claim_requires_canon_completed_layer"), true);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("receipt append blocks unsafe runtime paths before writing", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-ingest-receipt-blocked-"));

  try {
    await assert.rejects(
      () =>
        appendKnowledgeIngestReceipt({
          repoRoot,
          ledgerRef: "_workmeta/system/knowledge_ingest_receipts/events/2026-06.jsonl",
          projectCode: "system",
          captureSurface: "knowledge_ingest_cell",
          ingestRequestRef: `${"C:"}\\Soulforge\\private\\candidate.md`,
          summaryLabel: "unsafe path should block",
        }),
      /ingest_request_ref_must_not_be_runtime_absolute_path/,
    );

    await assert.rejects(
      () =>
        appendKnowledgeIngestReceipt({
          repoRoot,
          ledgerRef: "_workmeta/TEST/knowledge_ingest_receipts/events/2026-06.jsonl",
          projectCode: "system",
          captureSurface: "knowledge_ingest_cell",
          ingestRequestRef: "_workmeta/system/reports/procedure_capture/safe.md",
          summaryLabel: "bad ledger owner should block",
        }),
      /ledger_ref_must_be_under_workmeta_knowledge_ingest_receipts/,
    );
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("receipt validator rejects raw text and raw-source-like refs", () => {
  const safe = buildKnowledgeIngestReceipt({
    createdAt: "2026-06-19T05:06:07.000Z",
    projectCode: "system",
    captureSurface: "knowledge_ingest_cell",
    ingestRequestRef: "_workmeta/system/reports/procedure_capture/safe_receipt.md",
    summaryLabel: "raw source path regression guard",
    layerStates: {
      candidate: { status: "recorded", ref: "_workmeta/system/knowledge_rag_candidate_ledger/events/2026-06.jsonl#L3" },
      source: { status: "recorded", ref: "docs/architecture/workspace/KNOWLEDGE_INGEST_RECEIPT_V0.md" },
      wiki: { status: "missing" },
      rag: { status: "missing" },
      canon: { status: "missing" },
    },
  });
  const unsafeRawSegment = {
    ...safe,
    layer_states: {
      ...safe.layer_states,
      source: { ...safe.layer_states.source, ref: "_workspaces/system/raw/source-transcript.md" },
    },
  };
  const unsafeTextExtension = {
    ...safe,
    layer_states: {
      ...safe.layer_states,
      source: { ...safe.layer_states.source, ref: "_workspaces/knowledge/common/source_notes/source-transcript.txt" },
    },
  };

  const rawSegmentValidation = validateKnowledgeIngestReceipt(unsafeRawSegment);
  const textExtensionValidation = validateKnowledgeIngestReceipt(unsafeTextExtension);

  assert.equal(rawSegmentValidation.ok, false);
  assert.equal(textExtensionValidation.ok, false);
  assert.equal(JSON.stringify(rawSegmentValidation.errors).includes("raw_source_like_ref"), true);
  assert.equal(JSON.stringify(textExtensionValidation.errors).includes("raw_source_like_ref"), true);
});

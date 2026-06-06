import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import {
  appendKnowledgeRagCandidate,
  buildKnowledgeRagCandidate,
  triageKnowledgeRagCandidates,
  validateKnowledgeRagCandidate,
  validateKnowledgeRagCandidateLedgers,
} from "./knowledge_rag_candidate_ledger.mjs";

const execFileAsync = promisify(execFile);
const knowledgeAccessDir = path.dirname(fileURLToPath(import.meta.url));
const cliPath = path.join(knowledgeAccessDir, "cli.mjs");

test("buildKnowledgeRagCandidate creates deterministic metadata-only candidate ids", () => {
  const first = buildKnowledgeRagCandidate({
    createdAt: "2026-06-06T01:02:03.456Z",
    projectCode: "P01-001",
    sourceContextRef: "_workmeta/P01-001/reports/procedure_capture/candidate_ref.md",
    candidateKind: "knowledge_trigger",
    shortReason: "same metadata signal",
    suggestedRoute: "sourcebound_review_candidate",
    claimCeiling: "observed",
    missingInputs: ["source_packet_ref"],
    ownerQuestion: "Should this metadata signal receive sourcebound review?",
  });
  const second = buildKnowledgeRagCandidate({
    createdAt: "2026-06-06T09:09:09.000Z",
    projectCode: "P01-001",
    sourceContextRef: "_workmeta/P01-001/reports/procedure_capture/candidate_ref.md",
    candidateKind: "knowledge_trigger",
    shortReason: "same metadata signal",
    suggestedRoute: "sourcebound_review_candidate",
    claimCeiling: "observed",
    missingInputs: ["source_packet_ref"],
    ownerQuestion: "Should this metadata signal receive sourcebound review?",
  });

  assert.equal(first.candidate_id, second.candidate_id);
  assert.equal(first.created_at, "2026-06-06T01:02:03Z");
  assert.equal(validateKnowledgeRagCandidate(first).ok, true);
  assert.deepEqual(first.boundary, {
    metadata_only: true,
    payload_copied: false,
    source_payload_read: false,
    notebooklm_answer_stored: false,
    raw_prompt_or_question_stored: false,
    secret_present: false,
    runtime_absolute_path_present: false,
    canon_or_ontology_mutated: false,
    rag_ingestion_executed: false,
    graph_mutation_executed: false,
  });
});

test("appendKnowledgeRagCandidate appends one row to explicit workmeta candidate ledger ref", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-candidate-ledger-ref-"));

  try {
    const result = await appendKnowledgeRagCandidate({
      repoRoot,
      ledgerRef: "_workmeta/system/knowledge_rag_candidate_ledger/events/2026-06.jsonl",
      createdAt: "2026-06-06T02:03:04.000Z",
      projectCode: "system",
      sourceContextRef: "_workmeta/system/reports/post_development_review/review_packet.yaml",
      candidateKind: "owner_decision_gap",
      shortReason: "repeatable knowledge route needs owner decision",
      suggestedRoute: "owner_decision_needed",
      claimCeiling: "observed",
      missingInputs: ["owner_decision_ref"],
      ownerQuestion: "Should this deferred route stay metadata-only or become a sourcebound review candidate?",
      repeatedUseSignal: {
        count: 2,
        sourceEventCount: 3,
        lastSeenAt: "2026-06-06T02:02:00.000Z",
        signalRef: "_workmeta/system/reports/knowledge_access/rollup.json",
      },
    });

    assert.equal(result.ledger_ref, "_workmeta/system/knowledge_rag_candidate_ledger/events/2026-06.jsonl");
    const rows = await readRows(result.ledger_path);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].project_code, "system");
    assert.equal(rows[0].status, "open");
    assert.equal(rows[0].repeated_use_signal.count, 2);
    assert.equal(JSON.stringify(rows[0]).includes(repoRoot), false);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("CLI candidate-ledger-append, validate, and triage use explicit synthetic temp ledgers only", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-candidate-ledger-cli-"));
  const ledgerFile = path.join(os.tmpdir(), `soulforge-candidate-ledger-${Date.now()}.jsonl`);

  try {
    const appendResult = JSON.parse(
      (
        await execFileAsync(process.execPath, [
          cliPath,
          "candidate-ledger-append",
          "--repo-root",
          repoRoot,
          "--ledger-file",
          ledgerFile,
          "--created-at",
          "2026-06-06T03:04:05.000Z",
          "--project-code",
          "P02-002",
          "--source-context-ref",
          "_workmeta/P02-002/reports/procedure_capture/source_gap.md",
          "--candidate-kind",
          "rag_readiness_gap",
          "--short-reason",
          "RAG candidate lacks metadata source card",
          "--suggested-route",
          "rag_ingestion_candidate",
          "--claim-ceiling",
          "observed",
          "--missing-input",
          "owner_rag_ingestion_decision",
          "--missing-input",
          "knowledge_source_card",
          "--owner-question",
          "May this metadata source card be prepared for later RAG ingestion review?",
          "--repeated-count",
          "4",
          "--json",
        ])
      ).stdout,
    );

    assert.equal(appendResult.status, "recorded");
    assert.equal(appendResult.candidate.project_code, "P02-002");
    assert.equal(appendResult.candidate.suggested_route, "rag_ingestion_candidate");
    assert.equal("ledger_path" in appendResult, false);
    assert.equal(JSON.stringify(appendResult).includes(repoRoot), false);
    assert.equal(JSON.stringify(appendResult).includes(ledgerFile), false);

    const validateResult = JSON.parse(
      (
        await execFileAsync(process.execPath, [
          cliPath,
          "candidate-ledger-validate",
          "--repo-root",
          repoRoot,
          "--ledger-file",
          ledgerFile,
        ])
      ).stdout,
    );
    assert.equal(validateResult.status, "pass");
    assert.equal(validateResult.accepted_candidate_count, 1);

    const triageResult = JSON.parse(
      (
        await execFileAsync(process.execPath, [
          cliPath,
          "candidate-ledger-triage",
          "--repo-root",
          repoRoot,
          "--ledger-file",
          ledgerFile,
          "--now",
          "2026-06-06T03:10:00.000Z",
        ])
      ).stdout,
    );
    assert.equal(triageResult.status, "dry_run_complete");
    assert.equal(triageResult.groups.length, 1);
    assert.equal(triageResult.groups[0].project_code, "P02-002");
    assert.equal(triageResult.groups[0].suggested_route, "rag_ingestion_candidate");
    assert.equal(triageResult.groups[0].source_readiness, "missing_inputs_required");
    assert.equal(triageResult.groups[0].repeated_use_signal_count, 1);
    assert.equal(triageResult.boundary.rag_ingestion_executed, false);
    assert.equal(JSON.stringify(triageResult).includes(repoRoot), false);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
    await rm(ledgerFile, { force: true });
  }
});

test("candidate validator rejects raw payload keys, raw payload refs, absolute paths, and invalid projects", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-candidate-ledger-invalid-"));
  const ledgerFile = path.join(repoRoot, "_workmeta", "system", "knowledge_rag_candidate_ledger", "invalid.jsonl");
  const badPayload = "DO_NOT_ECHO_PRIVATE_PAYLOAD";
  const badNotebookLmAnswer = "DO_NOT_ECHO_NOTEBOOKLM_ANSWER";

  try {
    const valid = buildKnowledgeRagCandidate({
      createdAt: "2026-06-06T04:05:06.000Z",
      projectCode: "system",
      sourceContextRef: "_workmeta/system/reports/procedure_capture/safe.md",
      candidateKind: "manual_candidate",
      shortReason: "safe metadata signal",
      suggestedRoute: "metadata_only_record",
      claimCeiling: "observed",
    });
    const invalid = {
      ...valid,
      project_code: "TEST",
      source_context_ref: "mailbox/raw-message.eml",
      prompt: badPayload,
      notebooklm_answer: badNotebookLmAnswer,
      boundary: {
        ...valid.boundary,
        rag_ingestion_executed: true,
      },
    };
    await mkdir(path.dirname(ledgerFile), { recursive: true });
    await writeFile(ledgerFile, `${JSON.stringify(invalid)}\n`, "utf8");

    const result = await validateKnowledgeRagCandidateLedgers({
      repoRoot,
      ledgerRefs: "_workmeta/system/knowledge_rag_candidate_ledger/invalid.jsonl",
    });

    assert.equal(result.status, "fail");
    assert.equal(result.accepted_candidate_count, 0);
    assert.equal(result.invalid_candidate_count, 1);
    const serialized = JSON.stringify(result);
    assert.equal(serialized.includes(badPayload), false);
    assert.equal(serialized.includes(badNotebookLmAnswer), false);
    assert.equal(serialized.includes("project_code_not_allowed"), true);
    assert.equal(serialized.includes("raw_payload_ref_or_extension"), true);
    assert.equal(serialized.includes("forbidden_raw_or_payload_key"), true);
    assert.equal(serialized.includes("boundary.rag_ingestion_executed_must_be_false"), true);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("candidate capture blocks unsafe routes and paths before append", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-candidate-ledger-blocked-"));
  const ledgerRef = "_workmeta/system/knowledge_rag_candidate_ledger/blocked.jsonl";

  try {
    await assert.rejects(
      () =>
        appendKnowledgeRagCandidate({
          repoRoot,
          ledgerRef,
          projectCode: "P03-003",
          sourceContextRef: `${"C:"}\\Soulforge\\private\\runtime.md`,
          candidateKind: "manual_candidate",
          shortReason: "unsafe absolute path should block",
          suggestedRoute: "metadata_only_record",
        }),
      /source_context_ref_must_not_be_runtime_absolute_path/,
    );

    await assert.rejects(
      () =>
        appendKnowledgeRagCandidate({
          repoRoot,
          ledgerRef,
          projectCode: "P03-003",
          sourceContextRef: "_workmeta/P03-003/reports/procedure_capture/safe.md",
          candidateKind: "manual_candidate",
          shortReason: "automatic promotion should block",
          suggestedRoute: "canon_entry",
        }),
      /suggested_route_not_allowed/,
    );

    await assert.rejects(
      () =>
        appendKnowledgeRagCandidate({
          repoRoot,
          ledgerRef,
          projectCode: "P03-003",
          sourceContextRef: "_workmeta/P03-003/reports/procedure_capture/safe.md",
          candidateKind: "manual_candidate",
          shortReason: "canon candidate claim should stay outside this append lane",
          suggestedRoute: "ontology_candidate",
          claimCeiling: "canon_candidate",
        }),
      /claim_ceiling_not_allowed/,
    );

    await assert.rejects(
      () =>
        appendKnowledgeRagCandidate({
          repoRoot,
          ledgerRef: "_workmeta/TEST/knowledge_rag_candidate_ledger/bad.jsonl",
          projectCode: "system",
          sourceContextRef: "_workmeta/system/reports/procedure_capture/safe.md",
          candidateKind: "manual_candidate",
          shortReason: "bad ledger project should block",
          suggestedRoute: "metadata_only_record",
        }),
      /ledger_ref_must_be_under_workmeta_candidate_ledger/,
    );
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("triage excludes invalid rows and does not echo unsafe row payloads", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-candidate-ledger-triage-invalid-"));
  const ledgerFile = path.join(repoRoot, "_workmeta", "system", "knowledge_rag_candidate_ledger", "triage_invalid.jsonl");
  const payloadToken = "DO_NOT_ECHO_RAW_PAYLOAD";

  try {
    const valid = buildKnowledgeRagCandidate({
      createdAt: "2026-06-06T05:06:07.000Z",
      projectCode: "system",
      sourceContextRef: "_workmeta/system/reports/procedure_capture/safe.md",
      candidateKind: "sourcebound_gap",
      shortReason: "sourcebound review candidate from metadata",
      suggestedRoute: "sourcebound_review_candidate",
      claimCeiling: "observed",
      missingInputs: ["source_packet_ref"],
    });
    const invalid = { ...valid, candidate_id: "knowledge_rag_candidate_aaaaaaaaaaaaaaaa", raw: payloadToken };
    await mkdir(path.dirname(ledgerFile), { recursive: true });
    await writeFile(ledgerFile, `${JSON.stringify(valid)}\n${JSON.stringify(invalid)}\n`, "utf8");

    const result = await triageKnowledgeRagCandidates({
      repoRoot,
      ledgerRefs: "_workmeta/system/knowledge_rag_candidate_ledger/triage_invalid.jsonl",
      now: "2026-06-06T05:10:00.000Z",
    });

    assert.equal(result.status, "dry_run_with_rejected_rows");
    assert.equal(result.accepted_candidate_count, 1);
    assert.equal(result.invalid_candidate_count, 1);
    assert.equal(result.groups.length, 1);
    assert.equal(result.boundary.source_payloads_read, false);
    const serialized = JSON.stringify(result);
    assert.equal(serialized.includes(payloadToken), false);
    assert.equal(serialized.includes("forbidden_raw_or_payload_key"), true);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

async function readRows(filePath) {
  const raw = await readFile(filePath, "utf8");
  return raw.trim().split(/\r?\n/u).filter(Boolean).map((line) => JSON.parse(line));
}

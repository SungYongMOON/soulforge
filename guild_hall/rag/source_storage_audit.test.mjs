import assert from "node:assert/strict";
import crypto from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  buildKnowledgeSourceStorageAudit,
  validateKnowledgeSourceStorageAudit,
  writeKnowledgeSourceStorageAudit,
} from "./source_storage_audit.mjs";

test("knowledge source storage audit classifies workspace, external, missing, and orphan files", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-source-storage-audit-"));
  const externalRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-external-source-"));
  try {
    await writeFixtureRepo({ repoRoot, externalRoot });

    const result = await buildKnowledgeSourceStorageAudit({
      repoRoot,
      date: "2026-06-15",
      workspaceRootRefs: ["_workspaces/knowledge"],
      hashFiles: true,
      maxOrphanRows: 100,
    });

    assert.equal(result.status, "ready");
    assert.equal(result.summary.counts.source_records, 3);
    assert.equal(result.summary.counts.existing_originals, 2);
    assert.equal(result.summary.counts.missing_originals, 1);
    assert.equal(result.summary.counts.workspace_backed_sources, 1);
    assert.equal(result.summary.counts.external_pointer_only_sources, 1);
    assert.equal(result.summary.counts.orphan_workspace_files, 1);
    assert.equal(result.audit.boundary.read_only, true);
    assert.equal(result.audit.boundary.source_mutation_executed, false);
    assert.equal(result.audit.boundary.source_payloads_copied_or_moved, false);
    assert.equal(result.audit.boundary.source_text_or_payload_bodies_included, false);
    assert.equal(validateKnowledgeSourceStorageAudit(result.audit).status, "pass");

    const rowsByHandle = new Map(result.audit.source_rows.map((row) => [row.source_handle, row]));
    assert.equal(rowsByHandle.get("P1_EXISTING").storage_class, "workspace_backed");
    assert.equal(rowsByHandle.get("P1_EXISTING").source_file_state, "existing_original");
    assert.equal(rowsByHandle.get("P1_EXISTING").hash_status, "match");
    assert.equal(rowsByHandle.get("P1_MISSING").source_file_state, "missing_original");
    assert.equal(rowsByHandle.get("P2_EXTERNAL").storage_class, "external_pointer_only");
    assert.equal(rowsByHandle.get("P2_EXTERNAL").source_file_state, "existing_original");
    assert.equal(rowsByHandle.get("P2_EXTERNAL").hash_status, "match");

    const written = await writeKnowledgeSourceStorageAudit({
      repoRoot,
      date: "2026-06-15",
      auditId: "fixture_storage_audit",
      workspaceRootRefs: ["_workspaces/knowledge"],
      hashFiles: true,
      maxOrphanRows: 100,
    });
    assert.equal(written.status, "written");

    const summary = JSON.parse(await readFile(path.join(repoRoot, written.artifacts.summary_json_ref), "utf8"));
    assert.equal(summary.counts.external_pointer_only_sources, 1);
    const csv = await readFile(path.join(repoRoot, written.artifacts.source_storage_audit_csv_ref), "utf8");
    assert.match(csv, /P2_EXTERNAL/u);
    const decisionQueue = await readFile(path.join(repoRoot, written.artifacts.owner_decision_queue_ref), "utf8");
    assert.match(decisionQueue, /external_pointer_only/u);
  } finally {
    await rm(repoRoot, { force: true, recursive: true });
    await rm(externalRoot, { force: true, recursive: true });
  }
});

async function writeFixtureRepo({ repoRoot, externalRoot }) {
  const existingBody = "alpha";
  const externalBody = "external";
  const existingHash = sha256(existingBody);
  const externalHash = sha256(externalBody);
  const workspaceSourceRoot = path.join(repoRoot, "_workspaces", "P1", "sources");
  const workspaceKnowledgeRoot = path.join(repoRoot, "_workspaces", "knowledge");
  await mkdir(workspaceSourceRoot, { recursive: true });
  await mkdir(workspaceKnowledgeRoot, { recursive: true });
  await writeFile(path.join(workspaceSourceRoot, "existing.pdf"), existingBody, "utf8");
  await writeFile(path.join(workspaceKnowledgeRoot, "orphan.pdf"), "orphan", "utf8");
  await writeFile(path.join(externalRoot, "external.pdf"), externalBody, "utf8");

  await writeText(
    repoRoot,
    "_workmeta/P1/bindings/source_roots.yaml",
    [
      "project_code: P1",
      "bindings:",
      "  - binding_id: p1_workspace_sources",
      "    storage_surface: _workspaces",
      `    source_root_path: ${yamlSingle(workspaceSourceRoot)}`,
      "    agent_mutation_allowed: false",
      "    notebooklm_upload_allowed: false",
      "",
    ].join("\n"),
  );
  await writeText(
    repoRoot,
    "_workmeta/P1/reports/source_research/metadata_source_ledger.yaml",
    [
      "project_code: P1",
      "source_root_binding_ref: _workmeta/P1/bindings/source_roots.yaml",
      "source_entries:",
      "  - source_handle: P1_EXISTING",
      "    title_label: Existing workspace source",
      "    source_kind: pdf",
      "    storage_locator:",
      "      relative_path: existing.pdf",
      "    file_identity:",
      "      bytes: 5",
      `      sha256: ${existingHash}`,
      "  - source_handle: P1_MISSING",
      "    title_label: Missing workspace source",
      "    source_kind: pdf",
      "    storage_locator:",
      "      relative_path: missing.pdf",
      "    file_identity:",
      "      bytes: 10",
      "",
    ].join("\n"),
  );
  await writeText(
    repoRoot,
    "_workmeta/P2/bindings/source_roots.yaml",
    [
      "project_code: P2",
      "bindings:",
      "  - binding_id: p2_external_sources",
      "    storage_surface: owner_approved_shared_worksite",
      `    source_root_path: ${yamlSingle(externalRoot)}`,
      "    agent_mutation_allowed: false",
      "    notebooklm_upload_allowed: false",
      "",
    ].join("\n"),
  );
  await writeText(
    repoRoot,
    "_workmeta/P2/reports/source_research/metadata_source_ledger.yaml",
    [
      "project_code: P2",
      "source_root_binding_ref: _workmeta/P2/bindings/source_roots.yaml",
      "source_entries:",
      "  - source_handle: P2_EXTERNAL",
      "    title_label: External source",
      "    source_kind: pdf",
      "    storage_locator:",
      "      relative_path: external.pdf",
      "    file_identity:",
      "      bytes: 8",
      `      sha256: ${externalHash}`,
      "",
    ].join("\n"),
  );
}

async function writeText(repoRoot, ref, value) {
  const filePath = path.join(repoRoot, ref);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, value, "utf8");
}

function yamlSingle(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

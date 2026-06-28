import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import { openStore } from "../src/store.mjs";
import { buildProjectKnowledgeOverlay } from "../tools/haengbogwan_project_knowledge_overlay.mjs";

const TOOL = resolve(import.meta.dirname, "..", "tools", "haengbogwan_project_knowledge_overlay.mjs");
const BODY_SENTINEL = "PROJECT_WIKI_BODY_SENTINEL_DO_NOT_EMIT";
const CHUNK_SENTINEL = "RAG_CHUNK_SENTINEL_DO_NOT_EMIT";
const SOURCE_TEXT_SENTINEL = "DERIVED_SOURCE_TEXT_SENTINEL_DO_NOT_EMIT";
const SECRET_SENTINEL = "SECRET_SENTINEL_DO_NOT_EMIT";

function makeTempRuntime() {
  const root = mkdtempSync(join(tmpdir(), "sf-haengbogwan-knowledge-"));
  return {
    root,
    dbPath: join(root, "dev-erp.db"),
    cleanup: () => {
      if (existsSync(root)) rmSync(root, { recursive: true, force: true });
    },
  };
}

function writeKnowledgeFixture(root, project = "P26-014") {
  const projectWiki = join(root, "_workspaces", "knowledge", project, "wiki");
  mkdirSync(join(projectWiki, "chunks"), { recursive: true });
  writeFileSync(join(projectWiki, "project_page.md"), `# Project page\n${BODY_SENTINEL}\n`);
  writeFileSync(join(projectWiki, "chunks", "chunk-001.txt"), `${CHUNK_SENTINEL}\n`);
  writeFileSync(join(projectWiki, ".env"), `TOKEN=${SECRET_SENTINEL}\n`);

  mkdirSync(join(root, ".registry", "knowledge", "public_rule"), { recursive: true });
  writeFileSync(join(root, ".registry", "knowledge", "public_rule", "knowledge.yaml"), `title: public rule\nbody: ${BODY_SENTINEL}\n`);

  const ragReport = join(root, "_workmeta", project, "reports", "rag");
  mkdirSync(ragReport, { recursive: true });
  writeFileSync(join(ragReport, "route_manifest.yaml"), "route: P26-014\n");
  writeFileSync(join(ragReport, "source_card.yaml"), "card: metadata only\n");

  const sourceResearch = join(root, "_workmeta", project, "reports", "source_research");
  mkdirSync(sourceResearch, { recursive: true });
  writeFileSync(join(sourceResearch, "source_ledger.yaml"), "source: metadata only\n");

  const receipt = join(root, "_workmeta", project, "knowledge_ingest_receipts", "events");
  mkdirSync(receipt, { recursive: true });
  writeFileSync(join(receipt, "2026-06.jsonl"), "{\"event\":\"metadata_only\"}\n");

  const extract = join(root, "_workspaces", project, "reference_payloads", "knowledge_extract", "20260628", "derived_text");
  mkdirSync(extract, { recursive: true });
  writeFileSync(join(extract, "source_text.txt"), `${SOURCE_TEXT_SENTINEL}\n`);
}

function writeKnowledgeDb(dbPath) {
  const store = openStore(dbPath);
  try {
    const result = store.upsertKnowledge({
      id: "kvds_sdd_rule",
      title: "KVDS SDD document rule",
      summary: "SDD requests should be routed to systems engineering.",
      topic: "P26-014",
      keywords: "KVDS,SDD,CSCI",
      source_ref: "_workmeta/P26-014/reports/knowledge_wiki/kvds_sdd.md",
    });
    assert.equal(result.ok, true, JSON.stringify(result));
  } finally {
    store.db.close();
  }
}

test("HAENGBOGWAN-KNOWLEDGE: overlay exposes project refs without source payload leakage", () => {
  const tmp = makeTempRuntime();
  try {
    writeKnowledgeFixture(tmp.root);
    writeKnowledgeDb(tmp.dbPath);

    const overlay = buildProjectKnowledgeOverlay({
      repoRoot: tmp.root,
      dbPath: tmp.dbPath,
      projectId: "P26-014",
      queryTerms: ["KVDS SDD submit request"],
      limit: 30,
      generatedAt: "2026-06-28T00:00:00.000Z",
    });
    const text = JSON.stringify(overlay);
    assert.equal(overlay.project_id, "P26-014");
    assert.equal(overlay.boundary.metadata_only, true);
    assert.equal(overlay.boundary.source_text_loaded, false);
    assert.equal(overlay.boundary.rag_chunks_loaded, false);
    assert.equal(overlay.boundary.raw_payload_copied, false);
    assert.ok(overlay.wiki_page_refs.some((row) => row.page_ref === "_workspaces/knowledge/P26-014/wiki/project_page.md"));
    assert.ok(overlay.rag_route_refs.some((row) => row.route_ref === "_workmeta/P26-014/reports/rag/route_manifest.yaml"));
    assert.ok(overlay.knowledge_ledger_refs.some((row) => row.ledger_ref === "_workmeta/P26-014/reports/source_research/source_ledger.yaml"));
    assert.ok(overlay.core_knowledge_hits.some((row) => row.id === "kvds_sdd_rule"));
    assert.equal(text.includes(BODY_SENTINEL), false);
    assert.equal(text.includes(CHUNK_SENTINEL), false);
    assert.equal(text.includes(SOURCE_TEXT_SENTINEL), false);
    assert.equal(text.includes(SECRET_SENTINEL), false);

    const cli = spawnSync(process.execPath, [
      TOOL,
      "--repo-root", tmp.root,
      "--db", tmp.dbPath,
      "--project", "P26-014",
      "--query", "KVDS SDD submit request",
      "--limit", "30",
      "--json",
    ], { encoding: "utf8" });
    assert.equal(cli.status, 0, cli.stderr);
    assert.equal(cli.stdout.includes(BODY_SENTINEL), false);
    assert.equal(cli.stdout.includes(CHUNK_SENTINEL), false);
    assert.equal(cli.stdout.includes(SOURCE_TEXT_SENTINEL), false);
    const cliOverlay = JSON.parse(cli.stdout);
    assert.equal(cliOverlay.boundary.owner_approval_required_for_source_text, true);
  } finally {
    tmp.cleanup();
  }
});

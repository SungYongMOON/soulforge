import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { validateTopologyProviderFragment } from "../topology_federation.mjs";
import {
  KNOWLEDGE_STACK_SOURCE_REFS,
  buildKnowledgeStackTopologyProvider,
} from "./knowledge_stack.mjs";

const REPO_ROOT = new URL("../../../", import.meta.url);

function sourceBundle() {
  return KNOWLEDGE_STACK_SOURCE_REFS.map((ref) => ({
    ref,
    bytes: readFileSync(new URL(ref, REPO_ROOT)),
  }));
}

test("provider accepts only the exact public owner-contract source set", () => {
  const bundle = sourceBundle();
  assert.doesNotThrow(() => buildKnowledgeStackTopologyProvider(bundle));
  assert.throws(
    () => buildKnowledgeStackTopologyProvider(bundle.slice(1)),
    (error) => error?.code === "knowledge_stack_source_set_mismatch",
  );
  assert.throws(
    () => buildKnowledgeStackTopologyProvider([...bundle, bundle[0]]),
    (error) => error?.code === "knowledge_stack_source_duplicate",
  );
  assert.throws(
    () => buildKnowledgeStackTopologyProvider([...bundle, { ref: "README.md", bytes: Buffer.from("public") }]),
    (error) => error?.code === "knowledge_stack_source_not_allowlisted",
  );
  const privateLikeRef = ["C", ":", "\\", "private", "\\", "payload"].join("");
  assert.throws(
    () => buildKnowledgeStackTopologyProvider([...bundle, { ref: privateLikeRef, bytes: Buffer.from("public") }]),
    (error) => error?.code === "knowledge_stack_source_not_allowlisted" && !error.message.includes(privateLikeRef),
  );
  assert.throws(
    () => buildKnowledgeStackTopologyProvider(bundle.map((entry, index) => index === 0 ? { ...entry, note: "extra" } : entry)),
    (error) => error?.code === "knowledge_stack_source_entry_shape",
  );
  assert.throws(
    () => buildKnowledgeStackTopologyProvider(bundle.map((entry, index) => index === 0 ? { ...entry, bytes: entry.bytes.toString("utf8") } : entry)),
    (error) => error?.code === "knowledge_stack_source_bytes_invalid",
  );
});

test("source digest binds every source byte and is invariant to caller order", () => {
  const bundle = sourceBundle();
  const forward = buildKnowledgeStackTopologyProvider(bundle);
  const reverse = buildKnowledgeStackTopologyProvider([...bundle].reverse());
  assert.deepEqual(forward, reverse);

  const changed = sourceBundle();
  changed[0] = { ...changed[0], bytes: Buffer.concat([changed[0].bytes, Buffer.from("\n")]) };
  assert.notEqual(buildKnowledgeStackTopologyProvider(changed).source.digest, forward.source.digest);
});

test("provider exposes the fixed knowledge inventory and only source-supported relationships", () => {
  const provider = buildKnowledgeStackTopologyProvider(sourceBundle());
  assert.deepEqual(provider.nodes.map(({ id }) => id), [
    "knowledge_access",
    "knowledge_canon",
    "knowledge_graph",
    "knowledge_stack",
    "rag",
    "wiki_cell",
    "wiki_pipeline",
  ]);
  assert.deepEqual(provider.edges.map(({ id }) => id), [
    "access_projects_graph",
    "canon_projects_graph",
    "canon_supplies_rag",
    "graph_supplies_rag",
    "rag_projects_graph",
    "rag_records_access",
    "wiki_cell_routes_pipeline",
    "wiki_pipeline_advises_rag",
    "wiki_pipeline_routes_access",
  ]);
  assert.equal(provider.claim_ceiling, "source_supported");
  assert.equal(provider.runtime_state, "unknown");
  assert.equal(provider.capabilities.execute_repair, false);
  assert.ok(provider.nodes.every(({ repair_state }) => repair_state === "none"));
  assert.ok(provider.edges.every(({ evidence_mode }) => evidence_mode === "structural_only"));
});

test("provider output is public-safe and grants no truth, answer, approval, or mutation authority", () => {
  const provider = buildKnowledgeStackTopologyProvider(sourceBundle());
  assert.deepEqual(provider.authority_boundary, {
    source_truth: false,
    answer_authority: false,
    owner_approval_authority: false,
    runtime_mutation: false,
  });
  assert.doesNotThrow(() => validateTopologyProviderFragment(provider));

  const serialized = JSON.stringify(provider);
  for (const forbidden of [
    "_workspaces",
    "_workmeta",
    "answer_body",
    "source_text",
    "private_payload",
    "notebook_id",
  ]) assert.equal(serialized.includes(forbidden), false, forbidden);
  assert.doesNotMatch(serialized, /[a-z]:[\\/]/i);
});

test("contract-anchor mutation is refused and topology authority mutation remains invalid", () => {
  const bundle = sourceBundle();
  const ragIndex = bundle.findIndex(({ ref }) => ref === "guild_hall/rag/README.md");
  const ragText = bundle[ragIndex].bytes.toString("utf8").replace("rag_manifest_v0", "removed_manifest_contract");
  const changed = [...bundle];
  changed[ragIndex] = { ...changed[ragIndex], bytes: Buffer.from(ragText, "utf8") };
  assert.throws(
    () => buildKnowledgeStackTopologyProvider(changed),
    (error) => error?.code === "knowledge_stack_source_contract_mismatch",
  );

  const provider = buildKnowledgeStackTopologyProvider(bundle);
  provider.authority_boundary.answer_authority = true;
  assert.throws(() => validateTopologyProviderFragment(provider));
});

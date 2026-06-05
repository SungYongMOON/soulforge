import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { parse } from "yaml";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");

const TEMPLATE_REFS = {
  ledger: "docs/architecture/workspace/examples/llm_wiki_bookshelf/metadata_source_ledger.template.yaml",
  packetMap: "docs/architecture/workspace/examples/llm_wiki_bookshelf/notebooklm_packet_map.template.yaml",
};

const LOCAL_PATH_VALUE_MARKERS = [
  "/" + "Users/",
  "/" + "Volumes/",
];

const DANGEROUS_VALUE_MARKERS = [
  ...LOCAL_PATH_VALUE_MARKERS,
  "file://",
  "drive.google.com",
  "notebooklm.google.com",
  "notebooklm_answer",
  "source_text",
  "chunk_text",
  "access_token",
  "secret",
];

test("metadata source ledger template keeps the public-safe metadata boundary", async () => {
  const ledger = await loadTemplate(TEMPLATE_REFS.ledger);

  assert.equal(ledger.schema_version, "soulforge.llm_wiki_bookshelf.metadata_source_ledger.v0");
  assert.equal(ledger.metadata_boundary.metadata_only, true);
  assert.equal(ledger.metadata_boundary.source_payloads_included, false);
  assert.equal(ledger.metadata_boundary.notebooklm_answers_included, false);
  assert.equal(ledger.metadata_boundary.live_drive_ids_included, false);
  assert.equal(ledger.metadata_boundary.runtime_absolute_paths_included, false);
  assert.equal(ledger.metadata_boundary.secrets_or_account_state_included, false);
  assert.equal(ledger.claim_policy.default_claim_ceiling, "observed");
  assert.equal(ledger.claim_policy.notebooklm_output_is_authority, false);
  assert.equal(ledger.claim_policy.owner_review_required_for_public_promotion, true);

  assert.ok(Array.isArray(ledger.source_entries));
  assert.ok(ledger.source_entries.length > 0);
  assert.equal(ledger.source_entries[0].storage_locator.locator_kind, "owner_held_label");
  assert.equal(ledger.source_entries[0].notebooklm_use.allowed_for_packet, false);
  assert.equal(ledger.source_entries[0].review_state.claim_ceiling, "observed");
});

test("NotebookLM packet map template stays advisory-only and metadata-only", async () => {
  const packetMap = await loadTemplate(TEMPLATE_REFS.packetMap);

  assert.equal(packetMap.schema_version, "soulforge.llm_wiki_bookshelf.notebooklm_packet_map.v0");
  assert.equal(packetMap.packet_boundary.metadata_only, true);
  assert.equal(packetMap.packet_boundary.source_payloads_included, false);
  assert.equal(packetMap.packet_boundary.notebooklm_answers_included, false);
  assert.equal(packetMap.packet_boundary.live_notebook_ids_included, false);
  assert.equal(packetMap.packet_boundary.live_drive_ids_included, false);
  assert.equal(packetMap.packet_boundary.runtime_absolute_paths_included, false);
  assert.equal(packetMap.packet_boundary.advisory_only, true);
  assert.equal(packetMap.packet.claim_policy.notebooklm_output_claim_ceiling, "observed");
  assert.equal(packetMap.packet.claim_policy.canon_or_owner_approval_from_packet, false);
  assert.equal(packetMap.packet.query_log_policy.copy_answers_into_public_repo, false);
  assert.equal(packetMap.packet.query_log_policy.copy_source_excerpts_into_public_repo, false);

  assert.deepEqual(packetMap.packet.allowed_warehouse_states, [
    "10_CANON_source",
    "20_Project_CANON",
    "30_Domain_CANON",
  ]);
  assert.ok(packetMap.packet.allowed_warehouse_states.every((state) => state.includes("CANON")));
  assert.ok(packetMap.packet.excluded_warehouse_states.some((state) => /candidate/i.test(state)));
  assert.ok(packetMap.packet.excluded_warehouse_states.some((state) => /superseded/i.test(state)));
  assert.ok(packetMap.packet.excluded_warehouse_states.some((state) => /rejected/i.test(state)));
});

test("LLM wiki bookshelf templates do not include local, live, secret, or payload values", async () => {
  for (const [templateName, templateRef] of Object.entries(TEMPLATE_REFS)) {
    const template = await loadTemplate(templateRef);
    assertNoDangerousValueMarkers(templateName, template);
  }
});

async function loadTemplate(templateRef) {
  const templateText = await readFile(path.join(repoRoot, templateRef), "utf8");
  return parse(templateText);
}

function assertNoDangerousValueMarkers(templateName, template) {
  const stringValues = collectStringValues(template);
  const valuesJson = JSON.stringify(stringValues.map(({ value }) => value));
  const loweredValuesJson = valuesJson.toLowerCase();

  for (const marker of DANGEROUS_VALUE_MARKERS) {
    const loweredMarker = marker.toLowerCase();
    assert.equal(
      loweredValuesJson.includes(loweredMarker),
      false,
      `${templateName} contains dangerous public-template marker: ${marker}`,
    );
  }
}

function collectStringValues(value, pathSegments = []) {
  if (typeof value === "string") {
    return [{ path: pathSegments.join("."), value }];
  }

  if (Array.isArray(value)) {
    return value.flatMap((entry, index) => collectStringValues(entry, [...pathSegments, String(index)]));
  }

  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([key, entry]) => collectStringValues(entry, [...pathSegments, key]));
  }

  return [];
}

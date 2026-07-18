import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { digestInventory, restoreAndVerify, verifyPackage } from "./ontology_canon_package.mjs";

function fixture({ connected = true } = {}) {
  const root = mkdtempSync(path.join(os.tmpdir(), "soulforge-ontology-canon-"));
  mkdirSync(path.join(root, "projection"), { recursive: true });
  const payloadPath = path.join(root, "projection", "knowledge.yaml");
  writeFileSync(payloadPath, "knowledge_id: fixture\n", "utf8");
  const payload = readFileSync(payloadPath);
  const inventory = [{
    path: "projection/knowledge.yaml",
    bytes: payload.byteLength,
    sha256: createHash("sha256").update(payload).digest("hex"),
  }];
  const manifest = {
    schema_version: "soulforge.ontology_canon_package.v0",
    release_id: "fixture-release",
    created_at: "2026-07-15T00:00:00+09:00",
    source_projection: { soulforge_git_commit: "0123456789abcdef" },
    approval: { owner_decision_ref: "owner-decision:fixture" },
    classification: { sensitivity: "public_safe" },
    notebooklm: connected
      ? { status: "connected", notebook_id: "notebook-fixture", source_membership: [{ source_id: "source-fixture" }] }
      : { status: "pending_connection", notebook_id: null, source_membership: [] },
    recovery: { drive_to_soulforge: { status: connected ? "pass" : "pending" } },
    inventory,
    package_digest_sha256: digestInventory(inventory),
  };
  const manifestPath = path.join(root, "ontology_canon_manifest.json");
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return { root, manifestPath, payloadPath };
}

test("verifyPackage accepts a complete package", () => {
  const { manifestPath } = fixture();
  assert.equal(verifyPackage(manifestPath).status, "pass");
});

test("verifyPackage rejects a pending external binding unless explicitly allowed", () => {
  const { manifestPath } = fixture({ connected: false });
  assert.throws(() => verifyPackage(manifestPath), /connected NotebookLM/);
  assert.equal(verifyPackage(manifestPath, { allowPending: true }).status, "pass");
});

test("verifyPackage rejects payload tampering", () => {
  const { manifestPath, payloadPath } = fixture();
  writeFileSync(payloadPath, "knowledge_id: tampered\n", "utf8");
  assert.throws(() => verifyPackage(manifestPath), /inventory mismatch/);
});

test("restoreAndVerify copies a package into a fresh restore root and revalidates it", () => {
  const { root, manifestPath } = fixture();
  const restoreRoot = `${root}-restored`;
  const result = restoreAndVerify(manifestPath, restoreRoot);
  assert.equal(result.status, "pass");
  assert.equal(result.restored_to, restoreRoot);
});

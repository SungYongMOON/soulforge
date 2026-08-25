import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

import { createFieldFailureCorrectiveActionModuleManifest } from "../topology/field_failure_corrective_action_module_manifest.mjs";
import { CODES as MODULE_CODES } from "../../../core/validators/module_binding.mjs";

const RUNNER = "guild_hall/engineering_engine/engines/field_failure_corrective_action/tools/field_failure_corrective_action_runner.mjs";
const TOPOLOGY = "guild_hall/engineering_engine/engines/field_failure_corrective_action/topology/field_failure_corrective_action_topology.json";
const INTEGRATION_REQUEST = "guild_hall/engineering_engine/engines/field_failure_corrective_action/contracts/field_failure_corrective_action_integration_request_v0.md";

function manifestInput() {
  return {
    artifact_sha256: "a".repeat(64),
    build_commit: "e2acd5d8",
    configuration_hash: "b".repeat(64),
    dependency_versions: { core: "1.0.0" },
    engine_contract_abi_range: ">=1.0.0 <2.0.0",
    module_version: "0.1.0",
    rollback_compatible_with: [],
    supported_project_classifications: ["public_synthetic"],
    test_receipt_ref: "ffca-test-receipt-v0",
  };
}

test("FFCA zero-write runner emits deterministic public-synthetic JSON", () => {
  const first = execFileSync(process.execPath, [RUNNER], { encoding: "utf8" });
  const second = execFileSync(process.execPath, [RUNNER], { encoding: "utf8" });
  assert.equal(first, second);
  const result = JSON.parse(first);
  assert.deepEqual(result.execution_effects, {
    approval_writes: 0,
    erp_writes: 0,
    filesystem_writes: 0,
    model_calls: 0,
    network_calls: 0,
    task_writes: 0,
  });
});

test("FFCA domain-local topology and shared manifest factory remain bounded", () => {
  const topology = JSON.parse(readFileSync(TOPOLOGY, "utf8"));
  assert.equal(topology.domain_engine_id, "field_failure_corrective_action");
  assert.deepEqual(topology.external_authority_boundaries, [
    "quality_disposition",
    "technical_change_approval",
    "closure_decision",
  ]);

  const manifest = createFieldFailureCorrectiveActionModuleManifest(manifestInput());
  assert.equal(manifest.execution_mode, "deterministic_only");
  assert.equal(manifest.claim_ceiling, "source_supported");
});

test("FFCA manifest factory exposes only documented Core module validation errors", () => {
  const missingField = manifestInput();
  delete missingField.artifact_sha256;
  assert.throws(() => createFieldFailureCorrectiveActionModuleManifest(missingField), (error) => (
    error.code === MODULE_CODES.MANIFEST_FIELD_MISSING
  ));

  const invalidVersion = manifestInput();
  invalidVersion.module_version = "not-semver";
  assert.throws(() => createFieldFailureCorrectiveActionModuleManifest(invalidVersion), (error) => (
    error.code === MODULE_CODES.VERSION_NOT_EXACT
  ));

  const invalidHash = manifestInput();
  invalidHash.artifact_sha256 = "bad";
  assert.throws(() => createFieldFailureCorrectiveActionModuleManifest(invalidHash), (error) => (
    error.code === MODULE_CODES.ARTIFACT_HASH_INVALID
  ));

  const invalidAbi = manifestInput();
  invalidAbi.engine_contract_abi_range = "not-a-range";
  assert.throws(() => createFieldFailureCorrectiveActionModuleManifest(invalidAbi), (error) => (
    error.code === MODULE_CODES.ABI_RANGE_INVALID
  ));

  const floatingDependency = manifestInput();
  floatingDependency.dependency_versions = { core: "latest" };
  assert.throws(() => createFieldFailureCorrectiveActionModuleManifest(floatingDependency), (error) => (
    error.code === MODULE_CODES.FLOATING_DEPENDENCY
  ));
});

test("FFCA integration request enumerates all five local test files", () => {
  const request = readFileSync(INTEGRATION_REQUEST, "utf8");
  assert.doesNotMatch(request, /four local test files/i);
  for (const file of [
    "field_failure_corrective_action.test.mjs",
    "field_failure_corrective_action_compiler.test.mjs",
    "field_failure_corrective_action_hostile.test.mjs",
    "field_failure_corrective_action_runner.test.mjs",
    "field_failure_corrective_action_schema.test.mjs",
  ]) {
    assert.match(request, new RegExp(file.replaceAll(".", "\\.")));
  }
});

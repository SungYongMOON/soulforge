import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  PCB_COMPLIANCE_PUBLIC_SYNTHETIC_FIXTURE,
  PCB_COMPLIANCE_SOURCE_PACKET_SHA256,
  buildPcbCompliancePublicSyntheticRequest,
} from "../fixtures/pcb_compliance_public_synthetic.mjs";
import { assessPcbCompliance, validatePcbEffectiveRuleSet } from "../evaluator/pcb_compliance.mjs";
import {
  PCB_COMPLIANCE_RULES,
  PCB_COMPLIANCE_RULESET_REF,
} from "../rules/pcb_compliance_rules.mjs";
import { createPcbComplianceModuleManifest } from "../topology/pcb_compliance_module_manifest.mjs";

const clone = (value) => structuredClone(value);

test("PCB source packet bytes match its locked SHA-256", async () => {
  const packet = await readFile(new URL("../contracts/pcb_compliance_source_packet_v0.md", import.meta.url));
  const { createHash } = await import("node:crypto");
  assert.equal(createHash("sha256").update(packet).digest("hex"), PCB_COMPLIANCE_SOURCE_PACKET_SHA256);
});

test("PCB public-synthetic fixture remains a deterministic evidence-readiness-only assessment", () => {
  const result = assessPcbCompliance(buildPcbCompliancePublicSyntheticRequest());
  const states = Object.fromEntries(result.assessment.results.map((row) => [row.rule_id, row.state]));

  assert.deepEqual(states, {
    "PCB-NASA-FAB-01": "SATISFIED",
    "PCB-NASA-INSPECT-01": "MISSING",
    "PCB-NASA-TOOL-01": "UNKNOWN",
    "PCB-NASA-TRACE-01": "CONFLICT",
    "PCB-NASA-PROTECT-01": "NOT_APPLICABLE",
    "PCB-STD-APPLICABILITY-01": "UNKNOWN",
  });
  assert.equal(result.assessment.assessment_scope, "evidence_readiness_only");
  assert.equal(result.domain_result.product_acceptance, "NOT_EVALUATED");
  assert.equal(result.domain_result.workmanship_compliance, "NOT_EVALUATED");
  assert.deepEqual(result.receipt.effects, {
    filesystem_writes: 0,
    network_calls: 0,
    model_calls: 0,
    rag_queries: 0,
    external_actions: 0,
  });
});

test("PCB evaluator preserves input, freezes output, and replays identically after caller-order changes", () => {
  const request = buildPcbCompliancePublicSyntheticRequest();
  const before = clone(request);
  const first = assessPcbCompliance(request);
  const replay = clone(request);
  replay.domain_input.rows.reverse();
  const second = assessPcbCompliance(replay);

  assert.deepEqual(request, before);
  assert.ok(Object.isFrozen(first));
  assert.ok(Object.isFrozen(first.assessment));
  assert.ok(Object.isFrozen(first.assessment.results));
  assert.equal(first.receipt.assessment_digest, second.receipt.assessment_digest);
  assert.deepEqual(first.assessment.results, second.assessment.results);
});

test("controlled IPC clauses stay HOLD without an owner-approved lawful source binding", () => {
  const request = buildPcbCompliancePublicSyntheticRequest();
  const row = request.domain_input.rows.find((candidate) => candidate.rule_id === "PCB-STD-APPLICABILITY-01");
  row.observation = {
    attempted: true,
    evidence_state: "present",
    evidence_by_key: {
      lawful_access_authorization_ref: ["synthetic_standard_catalog_entry"],
      standard_applicability_ref: ["synthetic_standard_applicability"],
      standard_revision_ref: ["ipc-a-610-rev-j-2024-03"],
    },
  };
  row.standard_binding = {
    body_access_state: "metadata_only",
    lawful_source_ref: "synthetic_no_body_authority_v0",
    standard_revision_ref: "ipc-a-610-rev-j-2024-03",
  };

  const result = assessPcbCompliance(request);
  const outcome = result.assessment.results.find((candidate) => candidate.rule_id === "PCB-STD-APPLICABILITY-01");
  assert.equal(outcome.state, "UNKNOWN");
  assert.equal(outcome.reason_code, "PCB_CONTROLLED_STANDARD_HOLD");
});

test("PCB evaluator requires every rule-specific evidence key and refuses unknown keys", () => {
  const incomplete = buildPcbCompliancePublicSyntheticRequest();
  const fab = incomplete.domain_input.rows.find((candidate) => candidate.rule_id === "PCB-NASA-FAB-01");
  fab.observation = {
    attempted: true,
    evidence_state: "present",
    evidence_by_key: {
      approved_instruction_ref: ["synthetic_approved_instruction"],
    },
  };
  const incompleteResult = assessPcbCompliance(incomplete);
  const incompleteOutcome = incompleteResult.assessment.results.find((candidate) => candidate.rule_id === "PCB-NASA-FAB-01");
  assert.equal(incompleteOutcome.state, "UNKNOWN");
  assert.equal(incompleteOutcome.reason_code, "PCB_EVIDENCE_SUFFICIENCY_HOLD");

  const complete = buildPcbCompliancePublicSyntheticRequest();
  const completeOutcome = assessPcbCompliance(complete).assessment.results.find((candidate) => candidate.rule_id === "PCB-NASA-FAB-01");
  assert.equal(completeOutcome.state, "SATISFIED");

  const unknownKey = buildPcbCompliancePublicSyntheticRequest();
  const unknownFab = unknownKey.domain_input.rows.find((candidate) => candidate.rule_id === "PCB-NASA-FAB-01");
  unknownFab.observation = {
    attempted: true,
    evidence_state: "present",
    evidence_by_key: {
      approved_instruction_ref: ["synthetic_approved_instruction"],
      manufacturing_documentation_ref: ["synthetic_manufacturing_documentation"],
      unexpected_evidence_key: ["synthetic_unexpected_evidence"],
    },
  };
  assert.throws(() => assessPcbCompliance(unknownKey), (error) => error.code === "PCB_INPUT_REFUSED");
});

test("PCB evaluator closes row shapes before any NOT_APPLICABLE or HOLD outcome", () => {
  const extra = buildPcbCompliancePublicSyntheticRequest();
  extra.domain_input.rows[0].unexpected = "ignored-by-old-evaluator";
  assert.throws(() => assessPcbCompliance(extra), (error) => error.code === "PCB_INPUT_REFUSED");

  const absoluteExtra = buildPcbCompliancePublicSyntheticRequest();
  absoluteExtra.domain_input.rows[0].absolute_path = ["C:", "private", "payload"].join(String.fromCharCode(92));
  assert.throws(() => assessPcbCompliance(absoluteExtra), (error) => error.code === "PCB_INPUT_REFUSED");

  const secretExtra = buildPcbCompliancePublicSyntheticRequest();
  secretExtra.domain_input.rows[0].token = "synthetic_not_a_secret";
  assert.throws(() => assessPcbCompliance(secretExtra), (error) => error.code === "PCB_INPUT_REFUSED");

  const unsafeNotApplicable = buildPcbCompliancePublicSyntheticRequest();
  const protect = unsafeNotApplicable.domain_input.rows.find((candidate) => candidate.rule_id === "PCB-NASA-PROTECT-01");
  protect.authority_bindings = [{ family: "project_contract_baseline", authority_ref: "synthetic_ok", extra: "secret-shaped" }];
  assert.throws(() => assessPcbCompliance(unsafeNotApplicable), (error) => error.code === "PCB_INPUT_REFUSED");

  const unsafeHold = buildPcbCompliancePublicSyntheticRequest();
  const tool = unsafeHold.domain_input.rows.find((candidate) => candidate.rule_id === "PCB-NASA-TOOL-01");
  tool.observation = {
    attempted: true,
    evidence_state: "present",
    evidence_by_key: { unexpected: ["synthetic_unexpected"] },
  };
  assert.throws(() => assessPcbCompliance(unsafeHold), (error) => error.code === "PCB_INPUT_REFUSED");
});

test("PCB evaluator rejects forged packet/ruleset bindings, authority confusion, and unsafe shapes", () => {
  const forgedPacket = buildPcbCompliancePublicSyntheticRequest();
  forgedPacket.binding.source_packet_ref.content_id = "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";
  assert.throws(() => assessPcbCompliance(forgedPacket), (error) => error.code === "PCB_BINDING_REFUSED");

  const confusedAuthority = buildPcbCompliancePublicSyntheticRequest();
  const fab = confusedAuthority.domain_input.rows.find((candidate) => candidate.rule_id === "PCB-NASA-FAB-01");
  fab.authority_bindings = [{ family: "reviewed_wiki", authority_ref: "synthetic_evidence_ref" }];
  const result = assessPcbCompliance(confusedAuthority);
  const outcome = result.assessment.results.find((candidate) => candidate.rule_id === "PCB-NASA-FAB-01");
  assert.equal(outcome.state, "UNKNOWN");
  assert.equal(outcome.reason_code, "PCB_AUTHORITY_HOLD");

  const accessor = buildPcbCompliancePublicSyntheticRequest();
  Object.defineProperty(accessor.domain_input.rows[0], "case_id", {
    enumerable: true,
    get() { throw new Error("must not execute accessor"); },
  });
  assert.throws(() => assessPcbCompliance(accessor), (error) => error.code === "PCB_INPUT_REFUSED");
});

test("PCB effective ruleset admission refuses a getter without executing it", () => {
  const hostile = {};
  Object.defineProperty(hostile, "effective_rule_set", {
    enumerable: true,
    get() { throw new Error("effective getter must not execute"); },
  });
  assert.throws(() => validatePcbEffectiveRuleSet(hostile), (error) => error.code === "PCB_EFFECTIVE_RULESET_INVALID");
});

test("PCB effective ruleset admission refuses proxy, alias, and cyclic hostile shapes", () => {
  assert.throws(
    () => validatePcbEffectiveRuleSet(new Proxy({}, {})),
    (error) => error.code === "PCB_EFFECTIVE_RULESET_INVALID",
  );

  const aliasedRuleset = {
    schema_version: "soulforge.pcb_compliance.ruleset.v0",
    domain_engine_id: "pcb_compliance",
    source_packet_ref: { entity_id: "x", revision_id: "x", content_id: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", content_hash_alg: "sha256" },
    ruleset_ref: { entity_id: "x", revision_id: "x", content_id: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", content_hash_alg: "sha256" },
    rules: [],
    profile_rule_provenance: {},
    rule_count: 0,
  };
  const aliasEnvelope = { effective_rule_set: aliasedRuleset, duplicate: aliasedRuleset };
  assert.throws(() => validatePcbEffectiveRuleSet(aliasEnvelope), (error) => error.code === "PCB_EFFECTIVE_RULESET_INVALID");

  const cyclic = {};
  cyclic.effective_rule_set = cyclic;
  assert.throws(() => validatePcbEffectiveRuleSet(cyclic), (error) => error.code === "PCB_EFFECTIVE_RULESET_INVALID");
});

test("PCB topology manifest is caller-pinned and refuses release-shaped placeholders", () => {
  const input = {
    module_version: "0.1.0",
    build_commit: "a".repeat(40),
    artifact_sha256: "b".repeat(64),
    engine_contract_abi_range: ">=1.0.0 <2.0.0",
    supported_project_classifications: ["public_synthetic"],
    dependency_versions: { node: "22.0.0" },
    configuration_hash: "c".repeat(64),
    rollback_compatible_with: [],
    test_receipt_ref: "synthetic_test_receipt_v0",
  };
  const manifest = createPcbComplianceModuleManifest(input);
  assert.equal(manifest.module_id, "soulforge.engineering_engine.pcb_compliance");
  assert.equal(manifest.claim_ceiling, "source_supported");
  assert.throws(() => createPcbComplianceModuleManifest({ ...input, module_version: "latest" }), (error) => error.code === "MODULE_VERSION_NOT_EXACT");
});

test("PCB zero-write runner emits stable JSON without creating files in its caller directory", async () => {
  const temp = await mkdtemp(join(tmpdir(), "pcb-compliance-zero-write-"));
  try {
    const runner = fileURLToPath(new URL("../tools/pcb_compliance_runner.mjs", import.meta.url));
    const first = spawnSync(process.execPath, [runner], { cwd: temp, encoding: "utf8" });
    const second = spawnSync(process.execPath, [runner], { cwd: temp, encoding: "utf8" });
    assert.equal(first.status, 0, first.stderr);
    assert.equal(second.status, 0, second.stderr);
    assert.equal(first.stdout, second.stdout);
    assert.deepEqual(await readdir(temp), []);
    assert.equal(JSON.parse(first.stdout).receipt.effects.filesystem_writes, 0);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("PCB base rule data is ordered, candidate-only, and does not grant clause compliance", () => {
  assert.equal(PCB_COMPLIANCE_RULES.length, 6);
  assert.equal(PCB_COMPLIANCE_RULESET_REF.entity_id, "pcb-compliance-ruleset-v0");
  assert.deepEqual(
    PCB_COMPLIANCE_RULES.map((rule) => rule.rule_id),
    [...PCB_COMPLIANCE_RULES.map((rule) => rule.rule_id)].sort(),
  );
  assert.ok(PCB_COMPLIANCE_RULES.every((rule) => rule.claim_ceiling === "source_supported"));
  assert.ok(PCB_COMPLIANCE_PUBLIC_SYNTHETIC_FIXTURE.claim_ceiling === "source_supported");
});
